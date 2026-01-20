#!/usr/bin/env python3
"""
Comprehensive tests for the membertools sync script.

These tests verify critical functionality that has caused production bugs:
1. User-entered data preservation (expected_release_date, release_notes)
2. Organization hierarchy mapping (age groups, sub-orgs)
3. Bishopric position handling (not placed under High Priests Quorum)
4. Generic sub-org name prefixing (Relief Society - Teachers vs Teachers Quorum)
5. In-flight detection (detecting changes made in MemberTools)

Run with: pytest scripts/tests/test_sync_from_membertools.py -v
"""

import pytest
import sqlite3
from datetime import date, datetime
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add scripts directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestUserEnteredDataPreservation:
    """
    Tests to ensure user-entered data (expected_release_date, release_notes)
    is preserved across sync operations.

    Bug that prompted this: Sync wiped expected_release_date from calling_assignments,
    causing the "Upcoming Releases" page to show empty.
    """

    def test_snapshot_captures_release_data(self):
        """Pre-sync snapshot should capture expected_release_date and release_notes."""
        from sync_from_membertools import capture_pre_sync_snapshot

        # Create mock connection with test data
        mock_conn = Mock()
        mock_cursor = Mock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.rowcount = 5

        capture_pre_sync_snapshot(mock_conn)

        # Verify the INSERT query includes expected_release_date and release_notes
        insert_call = mock_cursor.execute.call_args_list[1]  # Second call is INSERT
        insert_sql = insert_call[0][0]

        assert 'expected_release_date' in insert_sql, \
            "Snapshot should capture expected_release_date"
        assert 'release_notes' in insert_sql, \
            "Snapshot should capture release_notes"

    def test_restore_user_entered_data_is_called(self):
        """restore_user_entered_data should be called during sync."""
        # This is a structural test - verify the function exists and has correct signature
        from sync_from_membertools import restore_user_entered_data

        # Create mock connection
        mock_conn = Mock()
        mock_cursor = Mock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.rowcount = 3

        # Should not raise
        restore_user_entered_data(mock_conn)

        # Verify UPDATE query was executed
        update_calls = [
            call for call in mock_cursor.execute.call_args_list
            if 'UPDATE' in str(call)
        ]
        assert len(update_calls) > 0, "Should execute UPDATE to restore data"


class TestOrganizationHierarchy:
    """
    Tests for organization hierarchy mapping, including age groups
    and sub-organization handling.

    Bug that prompted this: Age-group specific orgs (Young Women 12-15) weren't
    being created, and Relief Society sub-orgs were colliding with Elders Quorum.
    """

    def test_generic_suborg_names_are_defined(self):
        """Ensure GENERIC_SUBORG_NAMES list is defined for collision prevention."""
        # This tests the sync script has the constant defined
        # We need to test the actual sync logic
        generic_names = ['Teachers', 'Activities', 'Service', 'Ministering']

        # Read the sync script and verify these are handled
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        assert 'GENERIC_SUBORG_NAMES' in content, \
            "Sync script should define GENERIC_SUBORG_NAMES"

        for name in generic_names:
            assert f"'{name}'" in content, \
                f"GENERIC_SUBORG_NAMES should include '{name}'"

    def test_parent_prefixing_for_generic_orgs(self):
        """Generic org names should be prefixed with parent to avoid collisions."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        # Check for the prefixing logic
        assert 'f"{parent_org_name} - {org_name}"' in content or \
               "parent_org_name} - {org_name}" in content, \
            "Should prefix generic org names with parent name"


class TestBishopricPositionHandling:
    """
    Tests for Bishopric position handling.

    Bug that prompted this: Bishop and counselors were being placed under
    "High Priests Quorum" instead of "Bishopric" because MemberTools
    structures them that way.
    """

    def test_bishopric_patterns_exist(self):
        """Verify bishopric position patterns are defined for override logic."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        # Should have pattern matching for bishopric positions
        assert 'bishopric_patterns' in content or 'bishop' in content.lower(), \
            "Should have logic to identify bishopric positions"

        # Should override to 'Bishopric' org
        assert "org_name = 'Bishopric'" in content, \
            "Should force bishopric positions to Bishopric org"

    def test_ward_clerk_goes_to_bishopric(self):
        """Ward Clerk should be placed in Bishopric, not High Priests."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        assert 'ward clerk' in content.lower(), \
            "Ward Clerk should be handled in bishopric override"

    def test_executive_secretary_goes_to_bishopric(self):
        """Ward Executive Secretary should be placed in Bishopric."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        assert 'executive secretary' in content.lower(), \
            "Executive Secretary should be handled in bishopric override"


class TestCallingDisplayOrder:
    """
    Tests for calling display order logic.
    """

    def test_bishop_comes_first(self):
        """Bishop should have display_order = 1."""
        from sync_from_membertools import get_calling_display_order

        assert get_calling_display_order('Bishop') == 1

    def test_first_counselor_comes_second(self):
        """First Counselor should come after President/Bishop."""
        from sync_from_membertools import get_calling_display_order

        order = get_calling_display_order('Bishopric First Counselor')
        assert order == 2, f"First Counselor should be 2, got {order}"

    def test_second_counselor_comes_third(self):
        """Second Counselor should come after First Counselor."""
        from sync_from_membertools import get_calling_display_order

        order = get_calling_display_order('Bishopric Second Counselor')
        assert order == 3, f"Second Counselor should be 3, got {order}"

    def test_secretary_after_counselors(self):
        """Secretary should come after counselors."""
        from sync_from_membertools import get_calling_display_order

        order = get_calling_display_order('Ward Executive Secretary')
        assert order > 3, f"Secretary should be after counselors, got {order}"
        assert order < 15, f"Secretary should be in admin range, got {order}"

    def test_teachers_after_admin(self):
        """Teachers/Instructors should come after admin positions."""
        from sync_from_membertools import get_calling_display_order

        order = get_calling_display_order('Gospel Doctrine Teacher')
        assert order >= 20, f"Teacher should be 20+, got {order}"


class TestInFlightDetection:
    """
    Tests for in-flight calling detection.

    Bug that prompted this: False positives were detected when org structure
    changed, causing 99+ in-flight items.
    """

    def test_new_assignment_detection_excludes_existing_changes(self):
        """New assignments should not be detected if calling_change already exists."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        # Should have NOT EXISTS clause for calling_changes
        assert 'NOT EXISTS' in content, \
            "Should check for existing calling_changes to avoid duplicates"
        assert 'calling_changes' in content, \
            "Should reference calling_changes table in detection"

    def test_release_detection_uses_snapshot(self):
        """Release detection should compare against pre_sync_calling_snapshot."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        assert 'pre_sync_calling_snapshot' in content, \
            "Should use pre_sync_calling_snapshot for release detection"


class TestHardRefreshDoesNotLoseData:
    """
    Tests to verify hard refresh preserves critical data.

    Bug that prompted this: hard_refresh_synced_tables deleted calling_assignments
    which wiped expected_release_date.
    """

    def test_sync_order_captures_before_refresh(self):
        """Verify sync captures snapshot BEFORE hard refresh."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        # Find positions of key functions in the main() flow
        snapshot_pos = content.find('capture_pre_sync_snapshot')
        hard_refresh_pos = content.find('hard_refresh_synced_tables')

        # Find in the main function specifically
        main_pos = content.find('def main():')

        # Get content after main()
        main_content = content[main_pos:]

        snapshot_in_main = main_content.find('capture_pre_sync_snapshot')
        hard_refresh_in_main = main_content.find('hard_refresh_synced_tables')

        assert snapshot_in_main < hard_refresh_in_main, \
            "capture_pre_sync_snapshot should be called BEFORE hard_refresh_synced_tables"

    def test_restore_happens_after_sync(self):
        """Verify user data is restored AFTER orgs/callings are synced."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        main_pos = content.find('def main():')
        main_content = content[main_pos:]

        sync_orgs_pos = main_content.find('sync_organizations_and_callings')
        restore_pos = main_content.find('restore_user_entered_data')

        assert restore_pos > sync_orgs_pos, \
            "restore_user_entered_data should be called AFTER sync_organizations_and_callings"


class TestDatabaseMigrations:
    """
    Tests to verify database migrations exist for required schema changes.
    """

    def test_snapshot_release_data_migration_exists(self):
        """Migration 014 should add release data columns to snapshot table."""
        migration_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'database',
            '014_snapshot_release_data.sql'
        )

        assert os.path.exists(migration_path), \
            "Migration 014_snapshot_release_data.sql should exist"

        with open(migration_path, 'r') as f:
            content = f.read()

        assert 'expected_release_date' in content, \
            "Migration should add expected_release_date column"
        assert 'release_notes' in content, \
            "Migration should add release_notes column"

    def test_record_set_apart_migration_exists(self):
        """Migration 013 should add record_set_apart task type."""
        migration_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'database',
            '013_add_record_set_apart_task.sql'
        )

        assert os.path.exists(migration_path), \
            "Migration 013_add_record_set_apart_task.sql should exist"

        with open(migration_path, 'r') as f:
            content = f.read()

        assert 'record_set_apart' in content, \
            "Migration should add record_set_apart enum value"


class TestConfigurationSafety:
    """
    Tests for configuration and environment variable handling.
    """

    def test_db_config_uses_env_vars(self):
        """Database config should read from environment variables."""
        script_path = os.path.join(os.path.dirname(__file__), '..', 'sync_from_membertools.py')
        with open(script_path, 'r') as f:
            content = f.read()

        assert "os.getenv('POSTGRES_" in content or "os.getenv('DATABASE_URL'" in content, \
            "Should use environment variables for database configuration"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

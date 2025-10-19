// Callings that can only be changed by stake presidency (per General Handbook 30.8)
const RESTRICTED_CALLINGS = [
  'Bishop',
  'Bishopric First Counselor',
  'Bishopric Second Counselor',
  'Ward Clerk',
  'Ward Assistant Clerk',
  'Ward Executive Secretary',
  'Ward Assistant Executive Secretary',
  'Elders Quorum President',
];

// Callings that require men (per General Handbook)
const MALE_ONLY_CALLINGS = [
  'Bishop',
  'Bishopric',
  'Priests Quorum',
  'Teachers Quorum',
  'Deacons Quorum',
  'Elders Quorum',
  'Young Men',
  'Aaronic Priesthood',
  'Priesthood',
  'Sunday School President',
  'Sunday School First Counselor',
  'Sunday School Second Counselor',
  'Sunday School Secretary',
  'Ward Clerk',
  'Ward Assistant Clerk',
  'Assistant Clerk',
  'Ward Executive Secretary',
  'Ward Assistant Executive Secretary',
  'Assistant Executive Secretary',
  'Ward Mission Leader',
];

// Callings that require women (per General Handbook)
const FEMALE_ONLY_CALLINGS = [
  'Relief Society',
  'Young Women',
  'Primary President',
  'Primary First Counselor',
  'Primary Second Counselor',
  'Primary Secretary',
];

export function isRestrictedCalling(callingTitle: string): boolean {
  return RESTRICTED_CALLINGS.includes(callingTitle);
}

export function getCallingGenderRequirement(
  callingTitle: string,
  organizationName?: string
): 'male' | 'female' | 'any' {
  const titleLower = callingTitle.toLowerCase();
  const orgLower = organizationName?.toLowerCase() || '';

  // Check male-only callings
  if (MALE_ONLY_CALLINGS.some((pattern) =>
    titleLower.includes(pattern.toLowerCase()) ||
    orgLower.includes(pattern.toLowerCase())
  )) {
    return 'male';
  }

  // Check female-only callings
  if (FEMALE_ONLY_CALLINGS.some((pattern) =>
    titleLower.includes(pattern.toLowerCase()) ||
    orgLower.includes(pattern.toLowerCase())
  )) {
    return 'female';
  }

  return 'any';
}

export function getTimeInCalling(assignedDate?: string): string {
  if (!assignedDate) return '';

  const date = new Date(assignedDate);
  const now = new Date();
  const months = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (years > 0) {
    if (remainingMonths > 0) {
      return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    }
    return `${years} year${years > 1 ? 's' : ''}`;
  }
  return `${months} month${months !== 1 ? 's' : ''}`;
}

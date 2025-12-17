export interface Member {
  id: string;
  church_id?: number;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  photo_url?: string;
  household_id?: string;
  household_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: string;
  is_active: boolean;
  availability?: number;
  callings?: MemberCalling[];
  created_at: string;
  updated_at: string;
}

export interface MemberCalling {
  id: string;
  title: string;
  organization_name?: string;
  assigned_date?: string;
  sustained_date?: string;
}

export interface Household {
  id: string;
  household_name: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  parent_org_id?: string;
  level: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Calling {
  id: string;
  organization_id: string;
  organization_name?: string;
  title: string;
  position_type?: string;
  requires_setting_apart: boolean;
  display_order: number;
  parent_calling_id?: string;
  // Current assignment fields
  assignment_id?: string;
  assigned_date?: string;
  sustained_date?: string;
  set_apart_date?: string;
  expected_release_date?: string;
  release_notes?: string;
  assignment_active?: boolean;
  member_id?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  created_at: string;
  updated_at: string;
}

export type CallingChangeStatus = 'hold' | 'in_progress' | 'approved' | 'completed';

export interface CallingConsideration {
  id: string;
  calling_change_id: string;
  member_id: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  phone?: string;
  email?: string;
  is_selected_for_prayer: boolean;
  notes?: string;
  consideration_order: number;
  created_at: string;
  updated_at: string;
}

export interface CallingChange {
  id: string;
  calling_id: string;
  calling_title?: string;
  organization_name?: string;
  new_member_id?: string;
  new_first_name?: string;
  new_last_name?: string;
  new_photo_url?: string;
  current_member_id?: string;
  current_first_name?: string;
  current_last_name?: string;
  current_photo_url?: string;
  status: CallingChangeStatus;
  priority: number;
  assigned_to_bishopric_member?: string;
  created_date: string;
  completed_date?: string;
  considerations?: CallingConsideration[];
  tasks?: Task[];
  created_at: string;
  updated_at: string;
}

export type TaskType =
  | 'release_current'
  | 'extend_calling'
  | 'sustain_new'
  | 'release_sustained'
  | 'set_apart'
  | 'record_in_tools'
  | 'notify_organization';

export type TaskStatus = 'pending' | 'completed';

export interface Task {
  id: string;
  calling_change_id: string;
  task_type: TaskType;
  member_id?: string;
  first_name?: string;
  last_name?: string;
  calling_title?: string;
  assigned_to?: string;
  status: TaskStatus;
  due_date?: string;
  completed_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MemberCallingNeed {
  id: string;
  member_id: string;
  status: 'active' | 'hold';
  potential_callings?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

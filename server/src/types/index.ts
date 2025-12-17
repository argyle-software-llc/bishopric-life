export interface Member {
  id: string;
  church_id?: number;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  photo_url?: string;
  household_id?: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: string;
  is_active: boolean;
  availability?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Household {
  id: string;
  household_name: string;
  address?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Organization {
  id: string;
  name: string;
  parent_org_id?: string;
  level: number;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Calling {
  id: string;
  organization_id: string;
  title: string;
  position_type?: string;
  requires_setting_apart: boolean;
  display_order: number;
  parent_calling_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CallingAssignment {
  id: string;
  calling_id: string;
  member_id: string;
  assigned_date?: Date;
  sustained_date?: Date;
  set_apart_date?: Date;
  expected_release_date?: Date;
  release_notes?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type CallingChangeStatus = 'hold' | 'in_progress' | 'approved' | 'completed';

export interface CallingChange {
  id: string;
  calling_id: string;
  new_member_id?: string;
  current_member_id?: string;
  status: CallingChangeStatus;
  priority: number;
  assigned_to_bishopric_member?: string;
  created_date: Date;
  completed_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CallingConsideration {
  id: string;
  calling_change_id: string;
  member_id: string;
  is_selected_for_prayer: boolean;
  notes?: string;
  consideration_order: number;
  created_at: Date;
  updated_at: Date;
}

export type MemberCallingNeedStatus = 'active' | 'hold';

export interface MemberCallingNeed {
  id: string;
  member_id: string;
  status: MemberCallingNeedStatus;
  potential_callings?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
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
  assigned_to?: string;
  status: TaskStatus;
  due_date?: Date;
  completed_date?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface BishopricStewardship {
  id: string;
  bishopric_member: string;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Note {
  id: string;
  entity_type: string;
  entity_id: string;
  note_text?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

// Extended types with joined data
export interface CallingWithDetails extends Calling {
  organization?: Organization;
  current_assignment?: CallingAssignment & {
    member?: Member;
  };
}

export interface CallingChangeWithDetails extends CallingChange {
  calling?: CallingWithDetails;
  new_member?: Member;
  current_member?: Member;
  considerations?: (CallingConsideration & { member?: Member })[];
  tasks?: Task[];
}

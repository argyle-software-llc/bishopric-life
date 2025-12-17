import axios from 'axios';
import type {
  Member,
  Calling,
  CallingChange,
  CallingConsideration,
  Organization,
  Task,
} from '../types';

const api = axios.create({
  baseURL: '/api',
});

// Members
export const getMembers = () => api.get<Member[]>('/members').then((res) => res.data);

export const getMember = (id: string) =>
  api.get<Member>(`/members/${id}`).then((res) => res.data);

export const getMembersNeedingCallings = () =>
  api.get<Member[]>('/members/needs/callings').then((res) => res.data);

export const createMember = (member: Partial<Member>) =>
  api.post<Member>('/members', member).then((res) => res.data);

export const updateMember = (id: string, member: Partial<Member>) =>
  api.put<Member>(`/members/${id}`, member).then((res) => res.data);

export const addMemberCallingNeed = (
  memberId: string,
  data: { status?: string; potential_callings?: string; notes?: string }
) => api.post(`/members/${memberId}/calling-need`, data).then((res) => res.data);

export const removeMemberCallingNeed = (memberId: string) =>
  api.delete(`/members/${memberId}/calling-need`).then((res) => res.data);

// Callings
export const getCallings = () => api.get<Calling[]>('/callings').then((res) => res.data);

export const getCalling = (id: string) =>
  api.get<Calling>(`/callings/${id}`).then((res) => res.data);

export const createCalling = (calling: Partial<Calling>) =>
  api.post<Calling>('/callings', calling).then((res) => res.data);

export const updateCalling = (id: string, calling: Partial<Calling>) =>
  api.put<Calling>(`/callings/${id}`, calling).then((res) => res.data);

export const updateCallingAssignment = (
  callingId: string,
  assignmentId: string,
  data: { expected_release_date?: string | null; release_notes?: string | null }
) =>
  api
    .put(`/callings/${callingId}/assignment/${assignmentId}`, data)
    .then((res) => res.data);

export const getUpcomingReleases = () =>
  api.get('/callings/upcoming/releases').then((res) => res.data);

// Calling Changes
export const getCallingChanges = (status?: string) =>
  api
    .get<CallingChange[]>('/calling-changes', { params: { status } })
    .then((res) => res.data);

export const getCallingChange = (id: string) =>
  api.get<CallingChange>(`/calling-changes/${id}`).then((res) => res.data);

export const createCallingChange = (callingChange: Partial<CallingChange>) =>
  api.post<CallingChange>('/calling-changes', callingChange).then((res) => res.data);

export const updateCallingChange = (id: string, callingChange: Partial<CallingChange>) =>
  api.put<CallingChange>(`/calling-changes/${id}`, callingChange).then((res) => res.data);

export const addConsideration = (
  callingChangeId: string,
  consideration: Partial<CallingConsideration>
) =>
  api
    .post<CallingConsideration>(
      `/calling-changes/${callingChangeId}/considerations`,
      consideration
    )
    .then((res) => res.data);

export const removeConsideration = (callingChangeId: string, considerationId: string) =>
  api.delete(`/calling-changes/${callingChangeId}/considerations/${considerationId}`);

export const selectConsiderationForPrayer = (
  callingChangeId: string,
  considerationId: string
) =>
  api
    .put<CallingConsideration>(
      `/calling-changes/${callingChangeId}/considerations/${considerationId}/select`
    )
    .then((res) => res.data);

export const approveSelection = (callingChangeId: string) =>
  api
    .post<CallingChange>(`/calling-changes/${callingChangeId}/approve`)
    .then((res) => res.data);

export const finalizeCallingChange = (callingChangeId: string) =>
  api
    .post<CallingChange>(`/calling-changes/${callingChangeId}/finalize`)
    .then((res) => res.data);

// Organizations
export const getOrganizations = () =>
  api.get<Organization[]>('/organizations').then((res) => res.data);

export const getOrganization = (id: string) =>
  api.get<Organization>(`/organizations/${id}`).then((res) => res.data);

export const createOrganization = (organization: Partial<Organization>) =>
  api.post<Organization>('/organizations', organization).then((res) => res.data);

// Tasks
export const getTasks = (params?: { status?: string; assigned_to?: string }) =>
  api.get<Task[]>('/tasks', { params }).then((res) => res.data);

export const getBishopricMembers = () =>
  api.get<{ first_name: string; last_name: string; title: string }[]>('/tasks/bishopric')
    .then((res) => res.data);

export const createTask = (task: Partial<Task>) =>
  api.post<Task>('/tasks', task).then((res) => res.data);

export const updateTask = (id: string, task: Partial<Task>) =>
  api.put<Task>(`/tasks/${id}`, task).then((res) => res.data);

export const completeTask = (id: string) =>
  api.post<Task>(`/tasks/${id}/complete`).then((res) => res.data);

export const toggleTask = (id: string) =>
  api.post<Task>(`/tasks/${id}/toggle`).then((res) => res.data);

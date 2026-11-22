import type { AppRole } from './constants';

export interface Profile {
  id: string; full_name: string; email: string | null; title: string | null;
  role: AppRole | null; is_active: boolean; created_at: string; player_id?: string | null;
}

export interface Season { id: string; club_id: string; name: string; start_date: string; end_date: string; is_current: boolean; notes: string | null }

export interface Player {
  id: string; club_id: string; player_code: string; full_name: string; date_of_birth: string; nationality: string | null;
  photo_path: string | null; phone: string | null; email: string | null; address: string | null;
  jersey_number: number | null; position: string | null; height_cm: number | null; weight_kg: number | null; bmi: number | null;
  dominant_hand: string | null; team_category: string; registration_date: string; season_id: string | null;
  status: 'active' | 'inactive' | 'archived'; archived_at: string | null; is_demo: boolean; created_at: string; updated_at: string;
}

export interface EmergencyContact { id: string; club_id: string; player_id: string; contact_name: string; relationship: string | null; phone: string; is_primary: boolean }

export interface MedicalHistory {
  id: string; club_id: string; player_id: string; version: number; is_current: boolean;
  previous_conditions: string | null; chronic_diseases: string | null; previous_injuries: string | null;
  previous_surgeries: string | null; drug_allergies: string | null; food_allergies: string | null;
  current_medications: string | null; previous_hospitalizations: string | null; family_history: string | null;
  relevant_information: string | null; physician_notes: string | null; change_reason: string | null;
  created_at: string; created_by: string | null;
}

export interface Examination {
  id: string; club_id: string; exam_code: string; player_id: string; season_id: string | null; examination_date: string;
  physician_name: string; examination_type: string;
  bp_systolic: number | null; bp_diastolic: number | null; heart_rate: number | null; respiratory_rate: number | null;
  temperature_c: number | null; oxygen_saturation: number | null; height_cm: number | null; weight_kg: number | null; bmi: number | null;
  laboratory_tests: string | null; ecg: string | null; xray: string | null; mri: string | null; ultrasound: string | null;
  other_investigations: string | null; clinical_summary: string | null; identified_problems: string | null;
  recommendations: string | null; further_investigations: string | null; follow_up_date: string | null;
  clearance_status: string | null; clearance_restrictions: string | null; physician_signature: string | null;
  signed_at: string | null; is_archived: boolean; is_demo: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
}

export interface ExamFinding {
  id?: string; examination_id?: string; category: 'Systematic' | 'Orthopedic'; region: string; is_normal: boolean | null;
  clinical_findings: string | null; pain: string | null; range_of_motion: string | null; muscle_strength: string | null;
  joint_stability: string | null; special_tests: string | null; notes: string | null;
}

export interface Injury {
  id: string; club_id: string; injury_code: string; player_id: string; season_id: string | null; injury_date: string; injury_time: string | null;
  setting: string; match_opponent: string | null; training_session: string | null; mechanism: string | null;
  contact_type: string | null; onset: string | null; body_region: string; body_side: string | null; injury_type: string;
  anatomical_structure: string | null; diagnosis: string | null; severity: string; injury_grade: string | null;
  clinical_examination: string | null; special_tests: string | null; imaging_results: string | null; physician_assessment: string | null;
  status: string; is_recurrent: boolean; previous_injury_id: string | null; expected_return_date: string | null;
  return_to_play_date: string | null; closed_date: string | null; closure_notes: string | null;
  is_archived: boolean; is_demo: boolean; created_at: string; updated_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
}

export interface Followup {
  id: string; club_id: string; injury_id: string; followup_date: string; pain_score: number | null; swelling: string | null; tenderness: string | null;
  range_of_motion: string | null; muscle_strength: string | null; functional_status: string | null; clinical_findings: string | null;
  special_tests: string | null; treatment_provided: string | null; response_to_treatment: string | null;
  progress_assessment: string | null; updated_diagnosis: string | null; next_followup_date: string | null;
  physician_notes: string | null; created_at: string; created_by: string | null;
}

export interface Treatment {
  id: string; club_id: string; injury_id: string; treatment_date: string; treatment_type: string; details: string | null;
  medication_name: string | null; dosage: string | null; provided_by: string | null; notes: string | null; created_at: string; created_by: string | null;
}

export interface RehabProgram {
  id: string; club_id: string; program_code: string; injury_id: string; player_id: string; start_date: string; current_phase: string;
  phase_approved_by: string | null; phase_approved_at: string | null; goals: string | null; exercises: string | null;
  training_load: string | null; physician_review: string | null; status: string; end_date: string | null; is_demo: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
  injuries?: Pick<Injury, 'injury_code' | 'diagnosis' | 'body_region' | 'injury_type' | 'injury_date'>;
}

export interface RehabSession {
  id: string; club_id: string; program_id: string; session_date: string; phase: string; exercises: string | null; training_load: string | null;
  pain_score: number | null; range_of_motion: string | null; strength_progress: string | null; functional_progress: string | null;
  physiotherapy_notes: string | null; physician_review: string | null; created_at: string; created_by: string | null;
}

export interface RtpAssessment {
  id: string; club_id: string; rtp_code: string; injury_id: string; player_id: string; assessment_date: string;
  current_clinical_status: string | null; pain_score: number | null; pain_assessment: string | null; range_of_motion: string | null;
  muscle_strength: string | null; functional_testing: string | null; balance_assessment: string | null; agility: string | null;
  jumping_ability: string | null; landing_mechanics: string | null; sport_specific_tests: string | null; basketball_movement: string | null;
  training_tolerance: string | null; final_assessment: string | null; decision: string; decision_date: string;
  physician_name: string; clinical_notes: string | null; signature: string; is_demo: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
  injuries?: Pick<Injury, 'injury_code' | 'diagnosis' | 'body_region' | 'injury_type' | 'injury_date'>;
}

export interface Clearance {
  id: string; club_id: string; clearance_code: string; player_id: string; examination_id: string | null; rtp_assessment_id: string | null;
  clearance_status: string; restrictions: string | null; valid_until: string | null; decision_date: string;
  physician_name: string; signature: string; notes: string | null; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
}

export interface Availability {
  id: string; club_id: string; player_id: string; injury_id: string | null; effective_date: string; availability: string; medical_status: string;
  restrictions: string | null; staff_notes: string | null; internal_notes: string | null; shared_with_staff: boolean;
  next_followup_date: string | null; created_at: string; created_by: string | null;
}

/** Row returned by the get_team_availability() RPC (safe for all staff roles). */
export interface TeamAvailabilityRow {
  player_id: string; club_id: string; club_name: string; player_code: string; full_name: string; jersey_number: number | null; position: string; team_category: string;
  availability: string; medical_status: string; restrictions: string | null; staff_notes: string | null;
  effective_date: string | null; next_followup_date: string | null; last_assessment_date: string | null;
}

export interface MedicalDocument {
  id: string; club_id: string; player_id: string; examination_id: string | null; injury_id: string | null; category: string; title: string;
  description: string | null; document_date: string | null; file_path: string; file_name: string; mime_type: string;
  size_bytes: number; is_archived: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code'>;
}

export interface Exposure { id: string; club_id: string; season_id: string | null; session_date: string; session_type: 'Match' | 'Training'; duration_minutes: number; players_exposed: number; notes: string | null }

export interface AuditLog { id: number; club_id: string | null; user_id: string | null; action: string; record_type: string; record_id: string | null; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null; created_at: string }

export interface Club {
  id: string; club_code: string; name: string; short_name: string; player_id_prefix: string; logo_url: string | null;
  country: string | null; city: string | null; sport: string; competition_category: string | null; league: string | null;
  current_season: string | null; contact_person: string | null; phone: string | null; email: string | null; address: string | null;
  medical_notes: string | null; registration_date: string; status: 'active' | 'inactive'; is_demo: boolean; created_at: string; updated_at: string;
}
export interface ClubMember { club_id: string; user_id: string; created_at: string }
export interface BrandSettings { name: string; specialty: string; contact: string; logoPath: string; signaturePath: string }

export interface Prescription {
  id: string; club_id: string; player_id: string; injury_id: string | null;
  kind: 'Medication' | 'Supplement' | 'Exercise' | 'Treatment' | 'Other'; name: string; dose: string | null; instructions: string | null;
  schedule_times: string[]; days_of_week: number[]; start_date: string; end_date: string | null;
  is_active: boolean; share_with_staff: boolean; created_at: string;
}
/** One expected (or logged) dose. status null = not confirmed yet. */
export interface DoseEntry {
  prescription_id: string; player_id: string; scheduled_date: string; scheduled_time: string;
  status: 'taken' | 'skipped' | null; note: string | null; logged_at: string | null;
}
export interface AdherenceRow extends DoseEntry { full_name: string; jersey_number: number | null; kind: string; name: string; dose: string | null }
export interface TeamSummaryRow {
  player_id: string; player_code: string; full_name: string; jersey_number: number | null; position: string; team_category: string;
  availability: string; medical_status: string; restrictions: string | null; staff_notes: string | null; next_followup_date: string | null;
  rehab_phase: string | null; expected_return_date: string | null; open_injuries: number;
}
export interface AthletePortal {
  player: { id: string; full_name: string; player_code: string; jersey_number: number | null; position: string; club_name: string; club_short_name: string; club_logo: string | null } | null;
  availability: { availability: string; medical_status: string; restrictions: string | null; staff_notes: string | null; effective_date: string; next_followup_date: string | null } | null;
  injuries: { id: string; injury_code: string; injury_date: string; body_region: string; body_side: string | null; injury_type: string; diagnosis: string | null; status: string; expected_return_date: string | null }[];
  rehab: { id: string; program_code: string; current_phase: string; goals: string | null; exercises: string | null; training_load: string | null; start_date: string; status: string; body_region: string; injury_type: string }[];
  prescriptions: Pick<Prescription, 'id' | 'kind' | 'name' | 'dose' | 'instructions' | 'schedule_times' | 'days_of_week' | 'start_date' | 'end_date'>[];
  doses: DoseEntry[];
}
export interface AthleteAccount { user_id: string; email: string; full_name: string; is_active: boolean; player_id: string }

export interface ClubCategory { id: string; club_id: string; name: string; sort_order: number; is_active: boolean }
export interface StaffMember {
  id: string; club_id: string; full_name: string; app_role: 'head_coach' | 'team_manager' | 'assistant_medical_staff';
  title: string | null; category: string | null; phone: string | null; email: string | null; notes: string | null;
  profile_id: string | null; is_active: boolean; created_at: string;
}
export interface RegistrationRow {
  id: string; created_at: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; kind: 'athlete' | 'staff';
  club_id: string; club_name: string; person_id: string; person_name: string; person_detail: string | null;
  login: string; account_name: string; message: string | null; already_linked: boolean; decided_at: string | null; decision_note: string | null;
}
export interface MyRegistration { id: string; status: RegistrationRow['status']; kind: 'athlete' | 'staff'; club_name: string; person_name: string; decision_note: string | null; created_at: string }
export interface RecoveryEpisode {
  injury_id: string; injury_date: string; body_region: string; body_side: string | null; status: string;
  expected_return_date: string | null; return_to_play_date: string | null; closed_date: string | null; days_out: number;
  rehab: null | { current_phase: string; phase_number: number | null; phase_total: number; status: string; start_date: string; end_date: string | null;
    sessions: number; last_session_date: string | null; phase_history: { phase: string; from: string }[] };
  rtp: { decision: string; decision_date: string }[];
}
export interface RecoveryView {
  player: { id: string; full_name: string; jersey_number: number | null; position: string; team_category: string };
  availability: AthletePortal['availability'];
  episodes: RecoveryEpisode[];
}

// ---------------- Phase 1 ----------------
export interface BodyLocation { region: string; side?: 'Left' | 'Right' | 'Center' | null; view: 'front' | 'back' }
export type CaseStatus = 'New' | 'Under Review' | 'Information Requested' | 'Examination Scheduled' | 'In Treatment' | 'Closed';
export type CasePriority = 'Routine' | 'Priority' | 'Urgent';
export type CaseVisibility = 'private' | 'limited' | 'approved';
export interface MedicalCase {
  id: string; case_code: string; club_id: string; player_id: string; source: string; category: string; body_locations: BodyLocation[];
  onset_at: string | null; pain_score: number | null; how_started: string | null; context: string | null; can_continue: boolean | null;
  affects_movement: boolean | null; description: string | null; athlete_urgent: boolean; priority: CasePriority; status: CaseStatus;
  diagnosis: string | null; injury_id: string | null; examination_id: string | null; visibility: CaseVisibility; staff_status: string | null;
  shared_summary: string | null; shared_at: string | null; shared_by: string | null; closed_at: string | null; created_at: string; updated_at: string;
  players?: { full_name: string; player_code: string; jersey_number: number | null; position: string | null };
}
export interface CaseMessage { id: string; case_id: string; kind: 'private_note' | 'request_info' | 'instruction' | 'athlete_reply'; body: string; author_id: string | null; created_at: string }
export interface CaseFile { id: string; case_id: string; file_path: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }
export interface CaseDisclosure { id: string; case_id: string; visibility: CaseVisibility; staff_status: string | null; shared_summary: string | null; authorized_by: string | null; created_at: string }
export interface MyCase {
  id: string; case_code: string; category: string; body_locations: BodyLocation[]; pain_score: number | null; status: CaseStatus; priority: CasePriority;
  created_at: string; description: string | null; messages: { kind: CaseMessage['kind']; body: string; created_at: string }[];
  files: { file_name: string; file_path: string; mime_type: string }[];
}
export interface StaffCaseRow { case_id: string; player_id: string; full_name: string; jersey_number: number | null; staff_status: string; shared_summary: string | null; shared_at: string; case_status: string }
export interface WellnessSettings {
  club_id: string; pre_enabled: boolean; post_enabled: boolean; reminder_time: string; baseline_days: number; min_baseline: number;
  fatigue_rise: number; soreness_rise: number; readiness_drop: number; sleep_drop: number; sleep_min: number; high_score: number; missed_days: number;
}
export interface WellnessResponse {
  id: string; club_id?: string; player_id: string; kind: 'pre' | 'post'; response_date: string; session_type: string;
  sleep_hours: number | null; sleep_quality: number | null; fatigue: number | null; soreness: number | null; energy: number | null; readiness: number | null;
  unwell: boolean | null; illness_symptoms: string | null; pain: boolean | null; pain_location: string | null; pain_severity: number | null;
  pain_duration: string | null; pain_new: boolean | null; movement_affected: boolean | null; rpe: number | null; duration_minutes: number | null;
  session_load: number | null; completed_full: boolean | null; unusual_symptoms: string | null; notes: string | null; created_at: string;
}
export interface WellnessFlag { player_id: string; full_name: string; flag: string; detail: string; value: number | null; baseline: number | null }
export interface AppNotification { id: string; club_id: string | null; kind: string; priority: 'normal' | 'high' | 'urgent'; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }
export interface Announcement { id: string; club_id: string; kind: 'announcement' | 'instruction'; title: string; body: string; player_ids: string[] | null; include_staff: boolean; recipients: number; created_at: string }

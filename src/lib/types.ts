import type { AppRole } from './constants';

export interface Profile {
  id: string; full_name: string; email: string | null; title: string | null;
  role: AppRole | null; is_active: boolean; created_at: string;
}

export interface Season { id: string; name: string; start_date: string; end_date: string; is_current: boolean; notes: string | null }

export interface Player {
  id: string; player_code: string; full_name: string; date_of_birth: string; nationality: string | null;
  photo_path: string | null; phone: string | null; email: string | null; address: string | null;
  jersey_number: number | null; position: string; height_cm: number | null; weight_kg: number | null; bmi: number | null;
  dominant_hand: string | null; team_category: string; registration_date: string; season_id: string | null;
  status: 'active' | 'inactive' | 'archived'; archived_at: string | null; is_demo: boolean; created_at: string; updated_at: string;
}

export interface EmergencyContact { id: string; player_id: string; contact_name: string; relationship: string | null; phone: string; is_primary: boolean }

export interface MedicalHistory {
  id: string; player_id: string; version: number; is_current: boolean;
  previous_conditions: string | null; chronic_diseases: string | null; previous_injuries: string | null;
  previous_surgeries: string | null; drug_allergies: string | null; food_allergies: string | null;
  current_medications: string | null; previous_hospitalizations: string | null; family_history: string | null;
  relevant_information: string | null; physician_notes: string | null; change_reason: string | null;
  created_at: string; created_by: string | null;
}

export interface Examination {
  id: string; exam_code: string; player_id: string; season_id: string | null; examination_date: string;
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
  id: string; injury_code: string; player_id: string; season_id: string | null; injury_date: string; injury_time: string | null;
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
  id: string; injury_id: string; followup_date: string; pain_score: number | null; swelling: string | null; tenderness: string | null;
  range_of_motion: string | null; muscle_strength: string | null; functional_status: string | null; clinical_findings: string | null;
  special_tests: string | null; treatment_provided: string | null; response_to_treatment: string | null;
  progress_assessment: string | null; updated_diagnosis: string | null; next_followup_date: string | null;
  physician_notes: string | null; created_at: string; created_by: string | null;
}

export interface Treatment {
  id: string; injury_id: string; treatment_date: string; treatment_type: string; details: string | null;
  medication_name: string | null; dosage: string | null; provided_by: string | null; notes: string | null; created_at: string; created_by: string | null;
}

export interface RehabProgram {
  id: string; program_code: string; injury_id: string; player_id: string; start_date: string; current_phase: string;
  phase_approved_by: string | null; phase_approved_at: string | null; goals: string | null; exercises: string | null;
  training_load: string | null; physician_review: string | null; status: string; end_date: string | null; is_demo: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
  injuries?: Pick<Injury, 'injury_code' | 'diagnosis' | 'body_region' | 'injury_type' | 'injury_date'>;
}

export interface RehabSession {
  id: string; program_id: string; session_date: string; phase: string; exercises: string | null; training_load: string | null;
  pain_score: number | null; range_of_motion: string | null; strength_progress: string | null; functional_progress: string | null;
  physiotherapy_notes: string | null; physician_review: string | null; created_at: string; created_by: string | null;
}

export interface RtpAssessment {
  id: string; rtp_code: string; injury_id: string; player_id: string; assessment_date: string;
  current_clinical_status: string | null; pain_score: number | null; pain_assessment: string | null; range_of_motion: string | null;
  muscle_strength: string | null; functional_testing: string | null; balance_assessment: string | null; agility: string | null;
  jumping_ability: string | null; landing_mechanics: string | null; sport_specific_tests: string | null; basketball_movement: string | null;
  training_tolerance: string | null; final_assessment: string | null; decision: string; decision_date: string;
  physician_name: string; clinical_notes: string | null; signature: string; is_demo: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
  injuries?: Pick<Injury, 'injury_code' | 'diagnosis' | 'body_region' | 'injury_type' | 'injury_date'>;
}

export interface Clearance {
  id: string; clearance_code: string; player_id: string; examination_id: string | null; rtp_assessment_id: string | null;
  clearance_status: string; restrictions: string | null; valid_until: string | null; decision_date: string;
  physician_name: string; signature: string; notes: string | null; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code' | 'jersey_number' | 'position'>;
}

export interface Availability {
  id: string; player_id: string; injury_id: string | null; effective_date: string; availability: string; medical_status: string;
  restrictions: string | null; staff_notes: string | null; internal_notes: string | null; shared_with_staff: boolean;
  next_followup_date: string | null; created_at: string; created_by: string | null;
}

/** Row returned by the get_team_availability() RPC (safe for all staff roles). */
export interface TeamAvailabilityRow {
  player_id: string; player_code: string; full_name: string; jersey_number: number | null; position: string; team_category: string;
  availability: string; medical_status: string; restrictions: string | null; staff_notes: string | null;
  effective_date: string | null; next_followup_date: string | null; last_assessment_date: string | null;
}

export interface MedicalDocument {
  id: string; player_id: string; examination_id: string | null; injury_id: string | null; category: string; title: string;
  description: string | null; document_date: string | null; file_path: string; file_name: string; mime_type: string;
  size_bytes: number; is_archived: boolean; created_at: string;
  players?: Pick<Player, 'full_name' | 'player_code'>;
}

export interface Exposure { id: string; season_id: string | null; session_date: string; session_type: 'Match' | 'Training'; duration_minutes: number; players_exposed: number; notes: string | null }

export interface AuditLog { id: number; user_id: string | null; action: string; record_type: string; record_id: string | null; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null; created_at: string }

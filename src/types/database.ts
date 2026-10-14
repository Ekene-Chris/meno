
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "course_modules": {
                  Row: {
                    "course_id": string,"id": string,"position": number,"revision": number,"title": string,"topics": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"id": string,"position": number,"revision": number,"title": string,"topics": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "course_id"?: string,"id"?: string,"position"?: number,"revision"?: number,"title"?: string,"topics"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_modules_course_id_revision_user_id_fkey"
      columns: ["course_id","revision","user_id"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["course_id","revision","user_id"]
    }
                  ]
                },"course_revisions": {
                  Row: {
                    "checkpoint_module_id": string | null,"checkpoint_note": string | null,"confirmed_at": string | null,"course_id": string,"created_at": string,"outline": string,"revision": number,"source_type": string,"source_url": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checkpoint_module_id"?: string | null,"checkpoint_note"?: string | null,"confirmed_at"?: string | null,"course_id": string,"created_at"?: string,"outline": string,"revision": number,"source_type": string,"source_url"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "checkpoint_module_id"?: string | null,"checkpoint_note"?: string | null,"confirmed_at"?: string | null,"course_id"?: string,"created_at"?: string,"outline"?: string,"revision"?: number,"source_type"?: string,"source_url"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_checkpoint_module_fk"
      columns: ["course_id","revision","checkpoint_module_id"]
isOneToOne: false
      referencedRelation: "course_modules"
      referencedColumns: ["course_id","revision","id"]
    },{
      foreignKeyName: "course_revisions_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "course_summaries"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "course_revisions_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "confirmed_revision": number | null,"created_at": string,"id": string,"revision": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_revision"?: number | null,"created_at"?: string,"id"?: string,"revision": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "confirmed_revision"?: number | null,"created_at"?: string,"id"?: string,"revision"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_confirmed_revision_fk"
      columns: ["id","confirmed_revision"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["course_id","revision"]
    },{
      foreignKeyName: "course_latest_revision_fk"
      columns: ["id","revision"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["course_id","revision"]
    },{
      foreignKeyName: "courses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"diagnostic_attempts": {
                  Row: {
                    "answers": NonNullable<Json>,"content_hash": string,"content_version": string,"created_at": string,"evaluated_at": string | null,"evaluation": Json | null,"id": string,"public_content": NonNullable<Json>,"revision": number,"rubric_version": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers"?: NonNullable<Json>,"content_hash": string,"content_version": string,"created_at"?: string,"evaluated_at"?: string | null,"evaluation"?: Json | null,"id"?: string,"public_content": NonNullable<Json>,"revision"?: number,"rubric_version": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"content_hash"?: string,"content_version"?: string,"created_at"?: string,"evaluated_at"?: string | null,"evaluation"?: Json | null,"id"?: string,"public_content"?: NonNullable<Json>,"revision"?: number,"rubric_version"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diagnostic_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"diagnostic_mutations": {
                  Row: {
                    "attempt_id": string,"request_hash": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"request_hash": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"request_hash"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diagnostic_mutations_attempt_id_user_id_fkey"
      columns: ["attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "diagnostic_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "diagnostic_mutations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learner_skills": {
                  Row: {
                    "last_evidence_id": string | null,"skill_id": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_evidence_id"?: string | null,"skill_id": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "last_evidence_id"?: string | null,"skill_id"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learner_skills_last_evidence_id_user_id_skill_id_fkey"
      columns: ["last_evidence_id","user_id","skill_id"]
isOneToOne: false
      referencedRelation: "skill_evidence"
      referencedColumns: ["id","user_id","skill_id"]
    },{
      foreignKeyName: "learner_skills_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "learner_skills_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_events": {
                  Row: {
                    "entity_id": string | null,"id": string,"occurred_at": string,"request_hash": string | null,"request_id": string,"result": Json | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entity_id"?: string | null,"id"?: string,"occurred_at"?: string,"request_hash"?: string | null,"request_id": string,"result"?: Json | null,"type": string,"user_id": string
                  }
                  Update: {
                    "entity_id"?: string | null,"id"?: string,"occurred_at"?: string,"request_hash"?: string | null,"request_id"?: string,"result"?: Json | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_goals": {
                  Row: {
                    "created_at": string,"desired_skill": string,"id": string,"motivation": string | null,"status": string,"target_role": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"desired_skill": string,"id"?: string,"motivation"?: string | null,"status"?: string,"target_role"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"desired_skill"?: string,"id"?: string,"motivation"?: string | null,"status"?: string,"target_role"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_path_actions": {
                  Row: {
                    "input": NonNullable<Json>,"proposal_id": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "input": NonNullable<Json>,"proposal_id": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "input"?: NonNullable<Json>,"proposal_id"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_path_actions_proposal_id_user_id_fkey"
      columns: ["proposal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "learning_path_actions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_path_decisions": {
                  Row: {
                    "decided_at": string,"decision": string,"proposal_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "decided_at"?: string,"decision": string,"proposal_id": string,"user_id": string
                  }
                  Update: {
                    "decided_at"?: string,"decision"?: string,"proposal_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_path_decisions_proposal_id_user_id_fkey"
      columns: ["proposal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "learning_path_decisions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_path_mutations": {
                  Row: {
                    "course_id": string | null,"expected_revision": number,"proposal_id": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id"?: string | null,"expected_revision": number,"proposal_id": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "course_id"?: string | null,"expected_revision"?: number,"proposal_id"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_path_mutations_proposal_id_user_id_fkey"
      columns: ["proposal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "learning_path_mutations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_path_revisions": {
                  Row: {
                    "context": NonNullable<Json>,"context_hash": string,"created_at": string,"edited_from": string | null,"id": string,"path_id": string,"proposal": NonNullable<Json>,"revision": number,"selector_version": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context": NonNullable<Json>,"context_hash": string,"created_at"?: string,"edited_from"?: string | null,"id"?: string,"path_id": string,"proposal": NonNullable<Json>,"revision": number,"selector_version": string,"user_id": string
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"context_hash"?: string,"created_at"?: string,"edited_from"?: string | null,"id"?: string,"path_id"?: string,"proposal"?: NonNullable<Json>,"revision"?: number,"selector_version"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "edited_path_owner"
      columns: ["edited_from","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "learning_path_revisions_path_id_user_id_fkey"
      columns: ["path_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"learning_paths": {
                  Row: {
                    "active_revision": number | null,"created_at": string,"goal_id": string,"id": string,"revision": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_revision"?: number | null,"created_at"?: string,"goal_id": string,"id"?: string,"revision": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_revision"?: number | null,"created_at"?: string,"goal_id"?: string,"id"?: string,"revision"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "active_path_revision"
      columns: ["id","active_revision","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["path_id","revision","user_id"]
    },{
      foreignKeyName: "latest_path_revision"
      columns: ["id","revision","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["path_id","revision","user_id"]
    },{
      foreignKeyName: "learning_paths_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_goals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "learning_paths_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_resources": {
                  Row: {
                    "checked_at": string,"data_cost": string,"duration_minutes": number | null,"format": string,"id": string,"language": string,"provider": string,"quality_status": string,"review_after": string,"skill_id": string,"source_url": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at": string,"data_cost"?: string,"duration_minutes"?: number | null,"format"?: string,"id": string,"language"?: string,"provider"?: string,"quality_status"?: string,"review_after": string,"skill_id": string,"source_url": string,"title": string
                  }
                  Update: {
                    "checked_at"?: string,"data_cost"?: string,"duration_minutes"?: number | null,"format"?: string,"id"?: string,"language"?: string,"provider"?: string,"quality_status"?: string,"review_after"?: string,"skill_id"?: string,"source_url"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_resources_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"mentor_turns": {
                  Row: {
                    "context": NonNullable<Json>,"context_hash": string,"course_id": string | null,"created_at": string,"error_code": string | null,"goal_id": string,"input_hash": string,"model": string,"policy_version": string,"question": string,"request_id": string,"result": Json | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context": NonNullable<Json>,"context_hash": string,"course_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"goal_id": string,"input_hash": string,"model": string,"policy_version"?: string,"question": string,"request_id": string,"result"?: Json | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"context_hash"?: string,"course_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"goal_id"?: string,"input_hash"?: string,"model"?: string,"policy_version"?: string,"question"?: string,"request_id"?: string,"result"?: Json | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mentor_turns_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_goals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "mentor_turns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunities": {
                  Row: {
                    "content": NonNullable<Json>,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"id": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"id"?: string
                  }
                  Relationships: [

                  ]
                },"opportunity_requirements": {
                  Row: {
                    "content": NonNullable<Json>,"id": string,"opportunity_id": string,"skill_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"id": string,"opportunity_id": string,"skill_id": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"id"?: string,"opportunity_id"?: string,"skill_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_requirements_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_requirements_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunity_save_receipts": {
                  Row: {
                    "expected_saved": boolean,"opportunity_id": string,"request_id": string,"result": NonNullable<Json>,"saved": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expected_saved": boolean,"opportunity_id": string,"request_id": string,"result": NonNullable<Json>,"saved": boolean,"user_id": string
                  }
                  Update: {
                    "expected_saved"?: boolean,"opportunity_id"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"saved"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_save_receipts_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_save_receipts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"outline_extractions": {
                  Row: {
                    "course_id": string | null,"created_at": string,"error_code": string | null,"expected_confirmed_revision": number | null,"expected_revision": number,"input_hash": string,"model": string,"request_id": string,"result": Json | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"expected_confirmed_revision"?: number | null,"expected_revision": number,"input_hash": string,"model": string,"request_id": string,"result"?: Json | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "course_id"?: string | null,"created_at"?: string,"error_code"?: string | null,"expected_confirmed_revision"?: number | null,"expected_revision"?: number,"input_hash"?: string,"model"?: string,"request_id"?: string,"result"?: Json | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outline_extractions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practical_attempts": {
                  Row: {
                    "accepted_proposal_id": string | null,"catalog_id": string,"content_hash": string,"created_at": string,"feedback": Json | null,"goal_id": string,"id": string,"input": NonNullable<Json>,"public_content": NonNullable<Json>,"revision": number,"rubric_version": string,"status": string,"submitted_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_proposal_id"?: string | null,"catalog_id": string,"content_hash": string,"created_at"?: string,"feedback"?: Json | null,"goal_id": string,"id"?: string,"input"?: NonNullable<Json>,"public_content": NonNullable<Json>,"revision"?: number,"rubric_version": string,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "accepted_proposal_id"?: string | null,"catalog_id"?: string,"content_hash"?: string,"created_at"?: string,"feedback"?: Json | null,"goal_id"?: string,"id"?: string,"input"?: NonNullable<Json>,"public_content"?: NonNullable<Json>,"revision"?: number,"rubric_version"?: string,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practical_attempts_accepted_proposal_id_user_id_fkey"
      columns: ["accepted_proposal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_path_revisions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_attempts_catalog_id_fkey"
      columns: ["catalog_id"]
isOneToOne: false
      referencedRelation: "practical_catalog"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practical_attempts_goal_id_user_id_fkey"
      columns: ["goal_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_goals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practical_catalog": {
                  Row: {
                    "content_hash": string,"id": string,"public_content": NonNullable<Json>,"rubric_version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"id": string,"public_content": NonNullable<Json>,"rubric_version": string
                  }
                  Update: {
                    "content_hash"?: string,"id"?: string,"public_content"?: NonNullable<Json>,"rubric_version"?: string
                  }
                  Relationships: [

                  ]
                },"practical_mutations": {
                  Row: {
                    "attempt_id": string,"request_hash": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"request_hash": string,"request_id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"request_hash"?: string,"request_id"?: string,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practical_mutations_attempt_id_user_id_fkey"
      columns: ["attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "practical_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_mutations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practical_progress": {
                  Row: {
                    "attempt_id": string,"created_at": string,"id": string,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"created_at"?: string,"id"?: string,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"created_at"?: string,"id"?: string,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practical_progress_attempt_id_user_id_fkey"
      columns: ["attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "practical_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practical_progress_receipts": {
                  Row: {
                    "attempt_id": string,"content_hash": string,"progress_id": string,"request_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"content_hash": string,"progress_id": string,"request_id": string,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"content_hash"?: string,"progress_id"?: string,"request_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practical_progress_receipts_progress_id_user_id_fkey"
      columns: ["progress_id","user_id"]
isOneToOne: false
      referencedRelation: "practical_progress"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_progress_receipts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "bandwidth": string | null,"created_at": string,"device": string | null,"display_name": string | null,"entry_state": string,"id": string,"locale": string,"study_minutes_per_week": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bandwidth"?: string | null,"created_at"?: string,"device"?: string | null,"display_name"?: string | null,"entry_state": string,"id": string,"locale"?: string,"study_minutes_per_week"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "bandwidth"?: string | null,"created_at"?: string,"device"?: string | null,"display_name"?: string | null,"entry_state"?: string,"id"?: string,"locale"?: string,"study_minutes_per_week"?: number | null,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"saved_opportunities": {
                  Row: {
                    "baseline": NonNullable<Json>,"opportunity_id": string,"saved_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "baseline": NonNullable<Json>,"opportunity_id": string,"saved_at"?: string,"user_id": string
                  }
                  Update: {
                    "baseline"?: NonNullable<Json>,"opportunity_id"?: string,"saved_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_opportunities_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_opportunities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"skill_evidence": {
                  Row: {
                    "assessment_attempt_id": string | null,"assessment_method": string | null,"caveat": string | null,"evaluated_at": string,"id": string,"kind": string,"outcome": string,"practical_attempt_id": string | null,"rubric_version": string | null,"scope": string | null,"skill_id": string,"source_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_attempt_id"?: string | null,"assessment_method"?: string | null,"caveat"?: string | null,"evaluated_at"?: string,"id"?: string,"kind": string,"outcome": string,"practical_attempt_id"?: string | null,"rubric_version"?: string | null,"scope"?: string | null,"skill_id": string,"source_id": string,"user_id": string
                  }
                  Update: {
                    "assessment_attempt_id"?: string | null,"assessment_method"?: string | null,"caveat"?: string | null,"evaluated_at"?: string,"id"?: string,"kind"?: string,"outcome"?: string,"practical_attempt_id"?: string | null,"rubric_version"?: string | null,"scope"?: string | null,"skill_id"?: string,"source_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_diagnostic_owner"
      columns: ["assessment_attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "diagnostic_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "practical_evidence_owner"
      columns: ["practical_attempt_id","user_id"]
isOneToOne: false
      referencedRelation: "practical_attempts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "skill_evidence_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skill_evidence_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"skill_prerequisites": {
                  Row: {
                    "prerequisite_skill_id": string,"skill_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "prerequisite_skill_id": string,"skill_id": string
                  }
                  Update: {
                    "prerequisite_skill_id"?: string,"skill_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_prerequisites_prerequisite_skill_id_fkey"
      columns: ["prerequisite_skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skill_prerequisites_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"skills": {
                  Row: {
                    "description": string,"domain": string,"id": string,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"domain"?: string,"id": string,"name": string,"position": number
                  }
                  Update: {
                    "description"?: string,"domain"?: string,"id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            "ai_request_activity": {
                  Row: {
                    "created_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [

                  ]
                },"course_summaries": {
                  Row: {
                    "confirmed_revision": number | null,"id": string | null,"revision": number | null,"source_type": string | null,"title": string | null,"updated_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "course_confirmed_revision_fk"
      columns: ["id","confirmed_revision"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["course_id","revision"]
    },{
      foreignKeyName: "course_latest_revision_fk"
      columns: ["id","revision"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["course_id","revision"]
    },{
      foreignKeyName: "courses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "confirm_course":
{ Args: { "p_course_id": string,"p_expected_revision": number,"p_request_id": string }; Returns: Json
                           },
"evaluate_diagnostic_attempt":
{ Args: { "p_answers": Json,"p_attempt_id": string,"p_evaluation": Json,"p_expected_revision": number,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"finish_mentor_turn":
{ Args: { "p_error_code"?: string,"p_request_id": string,"p_result": Json,"p_user_id": string }; Returns: Json
                           },
"finish_outline_extraction":
{ Args: { "p_error_code"?: string,"p_request_id": string,"p_result": Json,"p_user_id": string }; Returns: Json
                           },
"get_journey_state":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_learning_path_context":
{ Args: { "p_course_id"?: string }; Returns: Json
                           },
"get_learning_path_review":
{ Args: { "p_before_revision"?: number,"p_course_id"?: string,"p_use_saved_course"?: boolean }; Returns: Json
                           },
"get_mentor_context":
{ Args: { "p_course_id"?: string,"p_use_accepted_course"?: boolean }; Returns: Json
                           },
"get_opportunity_radar":
{ Args: { "p_opportunity"?: string }; Returns: Json
                           },
"learning_path_context_for":
{ Args: { "p_course_id": string,"p_user_id": string }; Returns: Json
                           },
"mentor_context_for":
{ Args: { "p_course_id": string,"p_user_id": string }; Returns: Json
                           },
"mutate_practical_attempt":
{ Args: { "p_attempt_id": string,"p_expected_revision": number,"p_feedback"?: Json,"p_input": Json,"p_operation": string,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"opportunity_observations_for":
{ Args: { "p_opportunity": string,"p_user": string }; Returns: Json
                           },
"propose_learning_path":
{ Args: { "p_context_hash": string,"p_course_id"?: string,"p_expected_revision": number,"p_proposal": Json,"p_request_id": string,"p_selector_version": string,"p_user_id": string }; Returns: Json
                           },
"record_practical_progress":
{ Args: { "p_attempt_id": string,"p_content_hash": string,"p_feedback": Json,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"reserve_mentor_turn":
{ Args: { "p_context_hash": string,"p_course_id"?: string,"p_daily_limit"?: number,"p_model": string,"p_question": string,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"reserve_outline_extraction":
{ Args: { "p_course_id"?: string,"p_daily_limit"?: number,"p_expected_confirmed_revision"?: number,"p_expected_revision"?: number,"p_input_hash": string,"p_model"?: string,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"review_learning_path":
{ Args: { "p_adjustment": Json,"p_expected_revision": number,"p_operation": string,"p_proposal_id": string,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"save_course_draft":
{ Args: { "p_course_id"?: string,"p_expected_revision": number,"p_input": Json,"p_request_id": string }; Returns: Json
                           },
"save_diagnostic_answers":
{ Args: { "p_answers": Json,"p_attempt_id": string,"p_expected_revision": number,"p_request_id": string,"p_user_id": string }; Returns: Json
                           },
"save_opportunity":
{ Args: { "p_expected_saved": boolean,"p_opportunity": string,"p_request": string,"p_saved": boolean }; Returns: Json
                           },
"save_passport":
{ Args: { "p_input": Json,"p_request_id": string }; Returns: undefined
                           },
"start_diagnostic_attempt":
{ Args: { "p_content_hash": string,"p_public_content": Json,"p_request_id": string,"p_rubric_version": string,"p_user_id": string }; Returns: Json
                           },
"start_practical_attempt":
{ Args: { "p_request_id": string,"p_user_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const

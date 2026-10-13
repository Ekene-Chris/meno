
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "learner_skills": {
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
                    "entity_id": string | null,"id": string,"occurred_at": string,"request_id": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entity_id"?: string | null,"id"?: string,"occurred_at"?: string,"request_id": string,"type": string,"user_id": string
                  }
                  Update: {
                    "entity_id"?: string | null,"id"?: string,"occurred_at"?: string,"request_id"?: string,"type"?: string,"user_id"?: string
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
                },"skill_evidence": {
                  Row: {
                    "caveat": string | null,"evaluated_at": string,"id": string,"kind": string,"outcome": string,"rubric_version": string | null,"skill_id": string,"source_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caveat"?: string | null,"evaluated_at"?: string,"id"?: string,"kind": string,"outcome": string,"rubric_version"?: string | null,"skill_id": string,"source_id": string,"user_id": string
                  }
                  Update: {
                    "caveat"?: string | null,"evaluated_at"?: string,"id"?: string,"kind"?: string,"outcome"?: string,"rubric_version"?: string | null,"skill_id"?: string,"source_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
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
            [_ in never]: never
          }
          Functions: {
            "save_passport":
{ Args: { "p_input": Json,"p_request_id": string }; Returns: undefined
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

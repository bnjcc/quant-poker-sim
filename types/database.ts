export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      calibrations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
          hands_played: number;
          payload: Json;
        };
        Insert: {
          id: string;
          user_id?: string;
          name: string;
          created_at: string;
          updated_at?: string;
          hands_played: number;
          payload: Json;
        };
        Update: {
          name?: string;
          created_at?: string;
          updated_at?: string;
          hands_played?: number;
          payload?: Json;
        };
        Relationships: [];
      };
      experiments: {
        Row: {
          id: string;
          user_id: string;
          calibration_id: string | null;
          hand_set_id: string | null;
          created_at: string;
          updated_at: string;
          status: "pending" | "running" | "complete" | "cancelled";
          payload: Json;
        };
        Insert: {
          id: string;
          user_id?: string;
          calibration_id?: string | null;
          hand_set_id?: string | null;
          created_at: string;
          updated_at?: string;
          status: "pending" | "running" | "complete" | "cancelled";
          payload: Json;
        };
        Update: {
          calibration_id?: string | null;
          hand_set_id?: string | null;
          created_at?: string;
          updated_at?: string;
          status?: "pending" | "running" | "complete" | "cancelled";
          payload?: Json;
        };
        Relationships: [];
      };
      experiment_hands: {
        Row: {
          experiment_id: string;
          user_id: string;
          hand_set_id: string;
          hand_number: number;
          history: Json;
        };
        Insert: {
          experiment_id: string;
          user_id?: string;
          hand_set_id: string;
          hand_number: number;
          history: Json;
        };
        Update: {
          history?: Json;
        };
        Relationships: [];
      };
      strategy_reviews: {
        Row: {
          id: string;
          user_id: string;
          experiment_id: string;
          calibration_id: string | null;
          round_number: number;
          created_at: string;
          simulation_version: string;
          reviewed_decisions: number;
          agreed_decisions: number;
          corrected_decisions: number;
          accuracy: number;
          accepted: boolean;
          payload: Json;
        };
        Insert: {
          id: string;
          user_id?: string;
          experiment_id: string;
          calibration_id?: string | null;
          round_number: number;
          created_at: string;
          simulation_version: string;
          reviewed_decisions: number;
          agreed_decisions: number;
          corrected_decisions: number;
          accuracy: number;
          accepted: boolean;
          payload: Json;
        };
        Update: {
          calibration_id?: string | null;
          round_number?: number;
          created_at?: string;
          simulation_version?: string;
          reviewed_decisions?: number;
          agreed_decisions?: number;
          corrected_decisions?: number;
          accuracy?: number;
          accepted?: boolean;
          payload?: Json;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      finalize_experiment_run: {
        Args: {
          p_experiment_id: string;
          p_hand_set_id: string;
          p_status: "pending" | "running" | "complete" | "cancelled";
          p_payload: Json;
        };
        Returns: undefined;
      };
      save_experiment_strategy_review: {
        Args: {
          p_experiment_id: string;
          p_experiment_status: "pending" | "running" | "complete" | "cancelled";
          p_experiment_payload: Json;
          p_review_id: string;
          p_review_payload: Json;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_type": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_type": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"summary": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_type"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"summary"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"kind": string,"last_error": string | null,"next_attempt_at": string,"payment_id": string | null,"reservation_id": string,"sent_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"kind": string,"last_error"?: string | null,"next_attempt_at"?: string,"payment_id"?: string | null,"reservation_id": string,"sent_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"payment_id"?: string | null,"reservation_id"?: string,"sent_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_outbox_reservation_id_fkey"
      columns: ["reservation_id"]
isOneToOne: false
      referencedRelation: "reservations"
      referencedColumns: ["id"]
    }
                  ]
                },"guests": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"hotel_settings": {
                  Row: {
                    "cancellation_policy": string | null,"check_in_time": string,"check_out_time": string,"id": boolean,"staff_hold_hours": number,"updated_at": string,"website_hold_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cancellation_policy"?: string | null,"check_in_time"?: string,"check_out_time"?: string,"id"?: boolean,"staff_hold_hours"?: number,"updated_at"?: string,"website_hold_minutes"?: number
                  }
                  Update: {
                    "cancellation_policy"?: string | null,"check_in_time"?: string,"check_out_time"?: string,"id"?: boolean,"staff_hold_hours"?: number,"updated_at"?: string,"website_hold_minutes"?: number
                  }
                  Relationships: [
                    
                  ]
                },"payment_events": {
                  Row: {
                    "event_type": string,"id": number,"payload": NonNullable<Json>,"payload_hash": string,"processed_at": string | null,"processing_error": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_reference": string | null,"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_type": string,"id"?: never,"payload": NonNullable<Json>,"payload_hash": string,"processed_at"?: string | null,"processing_error"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_reference"?: string | null,"received_at"?: string
                  }
                  Update: {
                    "event_type"?: string,"id"?: never,"payload"?: NonNullable<Json>,"payload_hash"?: string,"processed_at"?: string | null,"processing_error"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_reference"?: string | null,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount_kobo": number,"created_at": string,"currency": string,"gateway_response": string | null,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"] | null,"notes": string | null,"paid_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_channel": string | null,"provider_reference": string | null,"receipt_number": string | null,"recorded_by": string | null,"reservation_id": string,"status": Database["public"]['Enums']["payment_status"],"updated_at": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"created_at"?: string,"currency"?: string,"gateway_response"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"paid_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_channel"?: string | null,"provider_reference"?: string | null,"receipt_number"?: string | null,"recorded_by"?: string | null,"reservation_id": string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "amount_kobo"?: number,"created_at"?: string,"currency"?: string,"gateway_response"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"method"?: Database["public"]['Enums']["payment_method"] | null,"notes"?: string | null,"paid_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_channel"?: string | null,"provider_reference"?: string | null,"receipt_number"?: string | null,"recorded_by"?: string | null,"reservation_id"?: string,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reservation_id_fkey"
      columns: ["reservation_id"]
isOneToOne: false
      referencedRelation: "reservations"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"receipt_counters": {
                  Row: {
                    "last_number": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number": number,"year": number
                  }
                  Update: {
                    "last_number"?: number,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"reservation_status_history": {
                  Row: {
                    "changed_by": string | null,"created_at": string,"from_status": Database["public"]['Enums']["reservation_status"] | null,"id": number,"reason": string | null,"reservation_id": string,"to_status": Database["public"]['Enums']["reservation_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["reservation_status"] | null,"id"?: never,"reason"?: string | null,"reservation_id": string,"to_status": Database["public"]['Enums']["reservation_status"]
                  }
                  Update: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["reservation_status"] | null,"id"?: never,"reason"?: string | null,"reservation_id"?: string,"to_status"?: Database["public"]['Enums']["reservation_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservation_status_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservation_status_history_reservation_id_fkey"
      columns: ["reservation_id"]
isOneToOne: false
      referencedRelation: "reservations"
      referencedColumns: ["id"]
    }
                  ]
                },"reservations": {
                  Row: {
                    "attention_reason": string | null,"cancellation_reason": string | null,"cancelled_at": string | null,"category_id": string,"check_in": string,"check_out": string,"checked_in_at": string | null,"checked_out_at": string | null,"confirmed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"guest_count": number,"guest_id": string,"hold_expires_at": string | null,"id": string,"nightly_rate_kobo": number,"nights": number | null,"public_token": string,"reference": string,"room_id": string | null,"source": Database["public"]['Enums']["booking_source"],"special_requests": string | null,"status": Database["public"]['Enums']["reservation_status"],"total_amount_kobo": number,"updated_at": string,"_flag_overpayment": boolean | null,"_settle_reservation": string | null
                  }
                  ComputedFields: "_flag_overpayment" | "_settle_reservation"
                  Insert: {
                    "attention_reason"?: string | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"category_id": string,"check_in": string,"check_out": string,"checked_in_at"?: string | null,"checked_out_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"guest_count": number,"guest_id": string,"hold_expires_at"?: string | null,"id"?: string,"nightly_rate_kobo": number,"nights"?: never,"public_token"?: string,"reference"?: string,"room_id"?: string | null,"source": Database["public"]['Enums']["booking_source"],"special_requests"?: string | null,"status"?: Database["public"]['Enums']["reservation_status"],"total_amount_kobo": number,"updated_at"?: string
                  }
                  Update: {
                    "attention_reason"?: string | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"category_id"?: string,"check_in"?: string,"check_out"?: string,"checked_in_at"?: string | null,"checked_out_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"guest_count"?: number,"guest_id"?: string,"hold_expires_at"?: string | null,"id"?: string,"nightly_rate_kobo"?: number,"nights"?: never,"public_token"?: string,"reference"?: string,"room_id"?: string | null,"source"?: Database["public"]['Enums']["booking_source"],"special_requests"?: string | null,"status"?: Database["public"]['Enums']["reservation_status"],"total_amount_kobo"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservations_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "room_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservations_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservations_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"room_categories": {
                  Row: {
                    "amenities": (string)[],"created_at": string,"description": string | null,"id": string,"is_active": boolean,"max_occupancy": number,"name": string,"nightly_rate_kobo": number,"short_description": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amenities"?: (string)[],"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"max_occupancy": number,"name": string,"nightly_rate_kobo": number,"short_description"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amenities"?: (string)[],"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"max_occupancy"?: number,"name"?: string,"nightly_rate_kobo"?: number,"short_description"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"room_category_images": {
                  Row: {
                    "alt_text": string,"category_id": string,"created_at": string,"id": string,"is_cover": boolean,"sort_order": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string,"category_id": string,"created_at"?: string,"id"?: string,"is_cover"?: boolean,"sort_order"?: number,"storage_path": string
                  }
                  Update: {
                    "alt_text"?: string,"category_id"?: string,"created_at"?: string,"id"?: string,"is_cover"?: boolean,"sort_order"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_category_images_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "room_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "category_id": string,"created_at": string,"floor": string | null,"id": string,"is_active": boolean,"maintenance_note": string | null,"readiness": Database["public"]['Enums']["room_readiness"],"room_number": string,"service_status": Database["public"]['Enums']["room_service_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"floor"?: string | null,"id"?: string,"is_active"?: boolean,"maintenance_note"?: string | null,"readiness"?: Database["public"]['Enums']["room_readiness"],"room_number": string,"service_status"?: Database["public"]['Enums']["room_service_status"],"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"floor"?: string | null,"id"?: string,"is_active"?: boolean,"maintenance_note"?: string | null,"readiness"?: Database["public"]['Enums']["room_readiness"],"room_number"?: string,"service_status"?: Database["public"]['Enums']["room_service_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "room_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"site_photos": {
                  Row: {
                    "alt_text": string,"created_at": string,"gallery_group": string | null,"id": string,"slot": string,"sort_order": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text": string,"created_at"?: string,"gallery_group"?: string | null,"id"?: string,"slot": string,"sort_order"?: number,"storage_path": string
                  }
                  Update: {
                    "alt_text"?: string,"created_at"?: string,"gallery_group"?: string | null,"id"?: string,"slot"?: string,"sort_order"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_create_reservation":
{ Args: { "p_category_id": string,"p_check_in": string,"p_check_out": string,"p_created_by": string,"p_email": string,"p_full_name": string,"p_guest_id": string,"p_guests": number,"p_hold": string,"p_phone": string,"p_source": Database["public"]['Enums']["booking_source"],"p_special_requests": string }; Returns: {
              "attention_reason": string | null,
"cancellation_reason": string | null,
"cancelled_at": string | null,
"category_id": string,
"check_in": string,
"check_out": string,
"checked_in_at": string | null,
"checked_out_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"created_by": string | null,
"currency": string,
"guest_count": number,
"guest_id": string,
"hold_expires_at": string | null,
"id": string,
"nightly_rate_kobo": number,
"nights": number | null,
"public_token": string,
"reference": string,
"room_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"special_requests": string | null,
"status": Database["public"]['Enums']["reservation_status"],
"total_amount_kobo": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "reservations"
        isOneToOne: true
        isSetofReturn: false
      } },
"_fail":
{ Args: { "p_code": string,"p_message": string }; Returns: undefined
                           },
"_flag_overpayment":
{ Args: { "p_res": Omit<Database["public"]['Tables']["reservations"]['Row'], Database["public"]['Tables']["reservations"]['ComputedFields']> }; Returns: boolean
                           },
"_free_units":
{ Args: { "p_category_id": string,"p_check_in": string,"p_check_out": string,"p_exclude"?: string }; Returns: number
                           },
"_is_live":
{ Args: { "p_hold": string,"p_status": Database["public"]['Enums']["reservation_status"] }; Returns: boolean
                           },
"_net_paid":
{ Args: { "p_reservation_id": string }; Returns: number
                           },
"_next_receipt_number":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_set_reason":
{ Args: { "p_reason": string }; Returns: undefined
                           },
"_settle_reservation":
{ Args: { "p_res": Omit<Database["public"]['Tables']["reservations"]['Row'], Database["public"]['Tables']["reservations"]['ComputedFields']> }; Returns: string
                           },
"_validate_stay":
{ Args: { "p_allow_past"?: boolean,"p_check_in": string,"p_check_out": string,"p_guests": number }; Returns: undefined
                           },
"apply_paystack_result":
{ Args: { "p_amount_kobo": number,"p_channel": string,"p_currency": string,"p_gateway_response": string,"p_paid_at": string,"p_reference": string,"p_status": string }; Returns: string
                           },
"assign_room":
{ Args: { "p_reservation_id": string,"p_room_id": string }; Returns: undefined
                           },
"begin_paystack_payment":
{ Args: { "p_public_token": string }; Returns: {
              "amount_kobo": number,"email": string,"reference": string,"reservation_reference": string
            }[]
                           },
"cancel_reservation":
{ Args: { "p_reason": string,"p_reservation_id": string }; Returns: undefined
                           },
"change_reservation_dates":
{ Args: { "p_check_in": string,"p_check_out": string,"p_reservation_id": string }; Returns: undefined
                           },
"check_in_reservation":
{ Args: { "p_reservation_id": string }; Returns: undefined
                           },
"check_out_reservation":
{ Args: { "p_reservation_id": string }; Returns: number
                           },
"claim_outbox":
{ Args: { "p_limit"?: number,"p_only"?: (string)[],"p_reservation"?: string }; Returns: {
              "attempts": number,
"created_at": string,
"id": string,
"kind": string,
"last_error": string | null,
"next_attempt_at": string,
"payment_id": string | null,
"reservation_id": string,
"sent_at": string | null,
"status": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "email_outbox"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_staff_reservation":
{ Args: { "p_category_id": string,"p_check_in": string,"p_check_out": string,"p_email"?: string,"p_full_name"?: string,"p_guest_id"?: string,"p_guests": number,"p_phone"?: string,"p_source": Database["public"]['Enums']["booking_source"],"p_special_requests"?: string }; Returns: {
              "id": string,"reference": string
            }[]
                           },
"create_website_reservation":
{ Args: { "p_category_slug": string,"p_check_in": string,"p_check_out": string,"p_email": string,"p_full_name": string,"p_guests": number,"p_phone": string,"p_special_requests"?: string }; Returns: {
              "hold_expires_at": string,"id": string,"public_token": string,"reference": string,"total_amount_kobo": number
            }[]
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["staff_role"]
                           },
"expire_unpaid_reservations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"finish_outbox":
{ Args: { "p_error"?: string,"p_id": string,"p_status": string }; Returns: undefined
                           },
"generate_reservation_reference":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"hotel_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_reservation_transition":
{ Args: { "from_status": Database["public"]['Enums']["reservation_status"],"to_status": Database["public"]['Enums']["reservation_status"] }; Returns: boolean
                           },
"log_activity":
{ Args: { "p_action": string,"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json,"p_summary": string }; Returns: undefined
                           },
"mark_no_show":
{ Args: { "p_reservation_id": string }; Returns: undefined
                           },
"override_payment_requirement":
{ Args: { "p_action": string,"p_extend_hours"?: number,"p_reason": string,"p_reservation_id": string }; Returns: undefined
                           },
"record_offline_payment":
{ Args: { "p_amount_kobo": number,"p_confirm_received": boolean,"p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_paid_on": string,"p_reference": string,"p_reservation_id": string }; Returns: {
              "outcome": string,"payment_id": string,"receipt_number": string
            }[]
                           },
"require_role":
{ Args: { "allowed": (Database["public"]['Enums']["staff_role"])[] }; Returns: string
                           },
"resolve_attention":
{ Args: { "p_note": string,"p_reservation_id": string }; Returns: undefined
                           },
"search_availability":
{ Args: { "p_check_in": string,"p_check_out": string,"p_guests": number }; Returns: {
              "category_id": string,"is_available": boolean,"max_occupancy": number,"name": string,"nightly_rate_kobo": number,"nights": number,"short_description": string,"slug": string,"total_kobo": number
            }[]
                           },
"update_reservation_details":
{ Args: { "p_guests": number,"p_reservation_id": string,"p_special_requests": string }; Returns: undefined
                           },
"update_room_status":
{ Args: { "p_note"?: string,"p_readiness"?: Database["public"]['Enums']["room_readiness"],"p_room_id": string,"p_service_status"?: Database["public"]['Enums']["room_service_status"] }; Returns: undefined
                           }
          }
          Enums: {
            "booking_source": "website"|"walk_in"|"phone"|"whatsapp"|"staff","payment_kind": "payment"|"refund","payment_method": "card"|"bank_transfer"|"cash"|"pos_terminal"|"ussd"|"other","payment_provider": "paystack"|"offline","payment_status": "pending"|"successful"|"failed"|"abandoned","reservation_status": "pending_payment"|"confirmed"|"checked_in"|"checked_out"|"cancelled"|"expired"|"no_show","room_readiness": "needs_cleaning"|"cleaning_in_progress"|"ready","room_service_status": "in_service"|"maintenance","staff_role": "owner"|"general_manager"|"front_desk"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "booking_source": ["website", "walk_in", "phone", "whatsapp", "staff"],"payment_kind": ["payment", "refund"],"payment_method": ["card", "bank_transfer", "cash", "pos_terminal", "ussd", "other"],"payment_provider": ["paystack", "offline"],"payment_status": ["pending", "successful", "failed", "abandoned"],"reservation_status": ["pending_payment", "confirmed", "checked_in", "checked_out", "cancelled", "expired", "no_show"],"room_readiness": ["needs_cleaning", "cleaning_in_progress", "ready"],"room_service_status": ["in_service", "maintenance"],"staff_role": ["owner", "general_manager", "front_desk"]
          }
        }
} as const

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          restaurant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          restaurant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          address: string | null
          billing_name: string | null
          cancel_at: string | null
          city: string | null
          current_period_end: string | null
          pec: string | null
          postal_code: string | null
          province: string | null
          restaurant_id: string
          sdi_code: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          tax_code: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          billing_name?: string | null
          cancel_at?: string | null
          city?: string | null
          current_period_end?: string | null
          pec?: string | null
          postal_code?: string | null
          province?: string | null
          restaurant_id: string
          sdi_code?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          billing_name?: string | null
          cancel_at?: string | null
          city?: string | null
          current_period_end?: string | null
          pec?: string | null
          postal_code?: string | null
          province?: string | null
          restaurant_id?: string
          sdi_code?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          created_by: string | null
          duration_min: number
          email: string | null
          guests: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          room_id: string | null
          source: string
          starts_at: string
          status: string
          table_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_min?: number
          email?: string | null
          guests: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          room_id?: string | null
          source?: string
          starts_at: string
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_min?: number
          email?: string | null
          guests?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          room_id?: string | null
          source?: string
          starts_at?: string
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_by: string | null
          course: number
          created_at: string
          dish_id: string
          id: string
          notes: string | null
          quantity: number
          session_id: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          course?: number
          created_at?: string
          dish_id: string
          id?: string
          notes?: string | null
          quantity?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          course?: number
          created_at?: string
          dish_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_menu_dishes: {
        Row: {
          custom_menu_id: string
          dish_id: string
        }
        Insert: {
          custom_menu_id: string
          dish_id: string
        }
        Update: {
          custom_menu_id?: string
          dish_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_menu_dishes_custom_menu_id_fkey"
            columns: ["custom_menu_id"]
            isOneToOne: false
            referencedRelation: "custom_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_menu_dishes_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_menu_schedules: {
        Row: {
          custom_menu_id: string
          day_of_week: number
          id: string
          period: string
        }
        Insert: {
          custom_menu_id: string
          day_of_week: number
          id?: string
          period: string
        }
        Update: {
          custom_menu_id?: string
          day_of_week?: number
          id?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_menu_schedules_custom_menu_id_fkey"
            columns: ["custom_menu_id"]
            isOneToOne: false
            referencedRelation: "custom_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_menus: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          allergens: string[]
          ayce_max_per_person: number | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          included_in_ayce: boolean
          is_active: boolean
          is_available: boolean
          name: string
          price: number
          restaurant_id: string
          short_code: string | null
          sort_order: number
          takeaway_available: boolean
          updated_at: string
          vat_rate_code: string
        }
        Insert: {
          allergens?: string[]
          ayce_max_per_person?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          included_in_ayce?: boolean
          is_active?: boolean
          is_available?: boolean
          name: string
          price: number
          restaurant_id: string
          short_code?: string | null
          sort_order?: number
          takeaway_available?: boolean
          updated_at?: string
          vat_rate_code?: string
        }
        Update: {
          allergens?: string[]
          ayce_max_per_person?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          included_in_ayce?: boolean
          is_active?: boolean
          is_available?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          short_code?: string | null
          sort_order?: number
          takeaway_available?: boolean
          updated_at?: string
          vat_rate_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "dishes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          payload: Json
          receipt_id: string | null
          restaurant_id: string
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload: Json
          receipt_id?: string | null
          restaurant_id: string
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          receipt_id?: string | null
          restaurant_id?: string
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_jobs_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "fiscal_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_receipts: {
        Row: {
          cash_amount: number
          created_at: string
          customer_email: string | null
          customer_lottery_code: string | null
          customer_tax_code: string | null
          discount_amount: number
          document_number: string | null
          electronic_amount: number
          email_sent_at: string | null
          error: string | null
          id: string
          idempotency_key: string
          issued_by: string | null
          issued_via: string
          items: Json
          kind: string
          linked_receipt_id: string | null
          order_id: string | null
          payment_id: string | null
          provider: string
          provider_env: string | null
          provider_receipt_id: string | null
          provider_response: Json | null
          restaurant_id: string
          session_id: string | null
          status: string
          total: number
          updated_at: string
          voucher_amount: number
          voucher_quantity: number
        }
        Insert: {
          cash_amount?: number
          created_at?: string
          customer_email?: string | null
          customer_lottery_code?: string | null
          customer_tax_code?: string | null
          discount_amount?: number
          document_number?: string | null
          electronic_amount?: number
          email_sent_at?: string | null
          error?: string | null
          id?: string
          idempotency_key: string
          issued_by?: string | null
          issued_via: string
          items: Json
          kind?: string
          linked_receipt_id?: string | null
          order_id?: string | null
          payment_id?: string | null
          provider?: string
          provider_env?: string | null
          provider_receipt_id?: string | null
          provider_response?: Json | null
          restaurant_id: string
          session_id?: string | null
          status?: string
          total: number
          updated_at?: string
          voucher_amount?: number
          voucher_quantity?: number
        }
        Update: {
          cash_amount?: number
          created_at?: string
          customer_email?: string | null
          customer_lottery_code?: string | null
          customer_tax_code?: string | null
          discount_amount?: number
          document_number?: string | null
          electronic_amount?: number
          email_sent_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string
          issued_by?: string | null
          issued_via?: string
          items?: Json
          kind?: string
          linked_receipt_id?: string | null
          order_id?: string | null
          payment_id?: string | null
          provider?: string
          provider_env?: string | null
          provider_receipt_id?: string | null
          provider_response?: Json | null
          restaurant_id?: string
          session_id?: string | null
          status?: string
          total?: number
          updated_at?: string
          voucher_amount?: number
          voucher_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_receipts_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_receipts_linked_receipt_id_fkey"
            columns: ["linked_receipt_id"]
            isOneToOne: false
            referencedRelation: "fiscal_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_receipts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_receipts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          ade_credentials_expire_at: string | null
          ade_credentials_set_at: string | null
          auto_issue_online_payments: boolean
          configured_at: string | null
          default_vat_rate_code: string
          email_to_customer: boolean
          enabled: boolean
          fiscal_id: string | null
          last_error: string | null
          onboarding_log: Json
          provider: string
          restaurant_id: string
          status: string
          tax_code: string | null
          updated_at: string
        }
        Insert: {
          ade_credentials_expire_at?: string | null
          ade_credentials_set_at?: string | null
          auto_issue_online_payments?: boolean
          configured_at?: string | null
          default_vat_rate_code?: string
          email_to_customer?: boolean
          enabled?: boolean
          fiscal_id?: string | null
          last_error?: string | null
          onboarding_log?: Json
          provider?: string
          restaurant_id: string
          status?: string
          tax_code?: string | null
          updated_at?: string
        }
        Update: {
          ade_credentials_expire_at?: string | null
          ade_credentials_set_at?: string | null
          auto_issue_online_payments?: boolean
          configured_at?: string | null
          default_vat_rate_code?: string
          email_to_customer?: boolean
          enabled?: boolean
          fiscal_id?: string | null
          last_error?: string | null
          onboarding_log?: Json
          provider?: string
          restaurant_id?: string
          status?: string
          tax_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          discount_duration: string
          discount_months: number | null
          discount_percent: number
          expires_at: string
          free_months: number
          id: string
          note: string | null
          stripe_coupon_id: string | null
          token: string
          used_at: string | null
          used_by_restaurant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_duration?: string
          discount_months?: number | null
          discount_percent?: number
          expires_at?: string
          free_months?: number
          id?: string
          note?: string | null
          stripe_coupon_id?: string | null
          token?: string
          used_at?: string | null
          used_by_restaurant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_duration?: string
          discount_months?: number | null
          discount_percent?: number
          expires_at?: string
          free_months?: number
          id?: string
          note?: string | null
          stripe_coupon_id?: string | null
          token?: string
          used_at?: string | null
          used_by_restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_restaurant_id_fkey"
            columns: ["used_by_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          can_take_payments: boolean
          created_at: string
          display_name: string
          is_active: boolean
          restaurant_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_take_payments?: boolean
          created_at?: string
          display_name?: string
          is_active?: boolean
          restaurant_id: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_take_payments?: boolean
          created_at?: string
          display_name?: string
          is_active?: boolean
          restaurant_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          course: number
          created_at: string
          dish_id: string | null
          dish_name: string
          id: string
          list_price: number
          notes: string | null
          order_id: string
          paid_quantity: number
          picked_quantity: number
          quantity: number
          ready_at: string | null
          restaurant_id: string
          served_at: string | null
          session_id: string | null
          status: string
          unit_price: number
          vat_rate_code: string
        }
        Insert: {
          course?: number
          created_at?: string
          dish_id?: string | null
          dish_name: string
          id?: string
          list_price: number
          notes?: string | null
          order_id: string
          paid_quantity?: number
          picked_quantity?: number
          quantity: number
          ready_at?: string | null
          restaurant_id: string
          served_at?: string | null
          session_id?: string | null
          status?: string
          unit_price: number
          vat_rate_code: string
        }
        Update: {
          course?: number
          created_at?: string
          dish_id?: string | null
          dish_name?: string
          id?: string
          list_price?: number
          notes?: string | null
          order_id?: string
          paid_quantity?: number
          picked_quantity?: number
          quantity?: number
          ready_at?: string | null
          restaurant_id?: string
          served_at?: string | null
          session_id?: string | null
          status?: string
          unit_price?: number
          vat_rate_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_first_name: string | null
          customer_last_name: string | null
          customer_lottery_code: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_tax_code: string | null
          id: string
          kind: string
          paid_amount: number
          payment_status: string
          picked_up_at: string | null
          pickup_code: string | null
          pickup_number: number | null
          pickup_token: string | null
          placed_by: string | null
          placed_by_staff: boolean
          ready_at: string | null
          restaurant_id: string
          session_id: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          customer_lottery_code?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_tax_code?: string | null
          id?: string
          kind: string
          paid_amount?: number
          payment_status?: string
          picked_up_at?: string | null
          pickup_code?: string | null
          pickup_number?: number | null
          pickup_token?: string | null
          placed_by?: string | null
          placed_by_staff?: boolean
          ready_at?: string | null
          restaurant_id: string
          session_id?: string | null
          status: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_first_name?: string | null
          customer_last_name?: string | null
          customer_lottery_code?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_tax_code?: string | null
          id?: string
          kind?: string
          paid_amount?: number
          payment_status?: string
          picked_up_at?: string | null
          pickup_code?: string | null
          pickup_number?: number | null
          pickup_token?: string | null
          placed_by?: string | null
          placed_by_staff?: boolean
          ready_at?: string | null
          restaurant_id?: string
          session_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          items: Json | null
          label: string | null
          method: string
          order_id: string | null
          recorded_by: string | null
          refunded_amount: number
          restaurant_id: string
          session_id: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_receipt_url: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          items?: Json | null
          label?: string | null
          method: string
          order_id?: string | null
          recorded_by?: string | null
          refunded_amount?: number
          restaurant_id: string
          session_id?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          items?: Json | null
          label?: string | null
          method?: string
          order_id?: string | null
          recorded_by?: string | null
          refunded_amount?: number
          restaurant_id?: string
          session_id?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_qr_codes: {
        Row: {
          assigned_at: string | null
          code: string
          created_at: string
          id: string
          label: string | null
          restaurant_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          code: string
          created_at?: string
          id?: string
          label?: string | null
          restaurant_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          code?: string
          created_at?: string
          id?: string
          label?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_qr_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_counters: {
        Row: {
          day: string
          last_number: number
          restaurant_id: string
        }
        Insert: {
          day: string
          last_number?: number
          restaurant_id: string
        }
        Update: {
          day?: string
          last_number?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          attempted_at: string
          id: number
          table_id: string
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          id?: never
          table_id: string
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          id?: never
          table_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pin_attempts_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_platform_admin: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_platform_admin?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_platform_admin?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      restaurant_bonuses: {
        Row: {
          created_at: string
          free_months: number
          granted_by: string | null
          id: string
          is_active: boolean
          reason: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          free_months: number
          granted_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          free_months?: number
          granted_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_bonuses_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_bonuses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          active_custom_menu_id: string | null
          auto_serve_ready_items: boolean
          ayce_default: Json | null
          course_suggestions_enabled: boolean
          courses_enabled: boolean
          cover_default: number
          dine_in_enabled: boolean
          menu_theme: Json
          reservation_duration_min: number
          reservation_room_selection: boolean
          reservations_enabled: boolean
          reservations_public: boolean
          restaurant_id: string
          show_prep_times: boolean
          updated_at: string
          view_only_menu: boolean
          weekly_schedule: Json
        }
        Insert: {
          active_custom_menu_id?: string | null
          auto_serve_ready_items?: boolean
          ayce_default?: Json | null
          course_suggestions_enabled?: boolean
          courses_enabled?: boolean
          cover_default?: number
          dine_in_enabled?: boolean
          menu_theme?: Json
          reservation_duration_min?: number
          reservation_room_selection?: boolean
          reservations_enabled?: boolean
          reservations_public?: boolean
          restaurant_id: string
          show_prep_times?: boolean
          updated_at?: string
          view_only_menu?: boolean
          weekly_schedule?: Json
        }
        Update: {
          active_custom_menu_id?: string | null
          auto_serve_ready_items?: boolean
          ayce_default?: Json | null
          course_suggestions_enabled?: boolean
          courses_enabled?: boolean
          cover_default?: number
          dine_in_enabled?: boolean
          menu_theme?: Json
          reservation_duration_min?: number
          reservation_room_selection?: boolean
          reservations_enabled?: boolean
          reservations_public?: boolean
          restaurant_id?: string
          show_prep_times?: boolean
          updated_at?: string
          view_only_menu?: boolean
          weekly_schedule?: Json
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_active_menu_fk"
            columns: ["active_custom_menu_id"]
            isOneToOne: false
            referencedRelation: "custom_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          setup_completed: boolean
          slug: string | null
          status: string
          suspension_reason: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          setup_completed?: boolean
          slug?: string | null
          status?: string
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          setup_completed?: boolean
          slug?: string | null
          status?: string
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      session_guests: {
        Row: {
          joined_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_guests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_secrets: {
        Row: {
          pin: string
          restaurant_id: string
          session_id: string
        }
        Insert: {
          pin: string
          restaurant_id: string
          session_id: string
        }
        Update: {
          pin?: string
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_secrets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_secrets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_accounts: {
        Row: {
          account_id: string
          charges_enabled: boolean
          details_submitted: boolean
          online_payments_enabled: boolean
          payouts_enabled: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          charges_enabled?: boolean
          details_submitted?: boolean
          online_payments_enabled?: boolean
          payouts_enabled?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          charges_enabled?: boolean
          details_submitted?: boolean
          online_payments_enabled?: boolean
          payouts_enabled?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_issued: boolean
          period_end: string | null
          period_start: string | null
          restaurant_id: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_issued?: boolean
          period_end?: string | null
          period_start?: string | null
          restaurant_id?: string | null
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_issued?: boolean
          period_end?: string | null
          period_start?: string | null
          restaurant_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          assistance_requested_at: string | null
          ayce: boolean
          ayce_interval_min: number
          ayce_max_rounds: number
          ayce_price: number
          closed_at: string | null
          closed_by: string | null
          cover_price: number
          customer_email: string | null
          customer_lottery_code: string | null
          customer_tax_code: string | null
          guests: number
          id: string
          notes: string
          opened_at: string
          opened_by: string | null
          restaurant_id: string
          status: string
          table_id: string
          updated_at: string
        }
        Insert: {
          assistance_requested_at?: string | null
          ayce?: boolean
          ayce_interval_min?: number
          ayce_max_rounds?: number
          ayce_price?: number
          closed_at?: string | null
          closed_by?: string | null
          cover_price?: number
          customer_email?: string | null
          customer_lottery_code?: string | null
          customer_tax_code?: string | null
          guests?: number
          id?: string
          notes?: string
          opened_at?: string
          opened_by?: string | null
          restaurant_id: string
          status?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          assistance_requested_at?: string | null
          ayce?: boolean
          ayce_interval_min?: number
          ayce_max_rounds?: number
          ayce_price?: number
          closed_at?: string | null
          closed_by?: string | null
          cover_price?: number
          customer_email?: string | null
          customer_lottery_code?: string | null
          customer_tax_code?: string | null
          guests?: number
          id?: string
          notes?: string
          opened_at?: string
          opened_by?: string | null
          restaurant_id?: string
          status?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          qr_token: string
          restaurant_id: string
          room_id: string | null
          seats: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          qr_token?: string
          restaurant_id: string
          room_id?: string | null
          seats?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          qr_token?: string
          restaurant_id?: string
          room_id?: string | null
          seats?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      takeaway_settings: {
        Row: {
          auto_mark_picked_up: boolean
          auto_print: boolean
          enabled: boolean
          estimated_minutes: number
          field_email: string
          field_first_name: string
          field_last_name: string
          field_phone: string
          max_orders_per_hour: number | null
          pickup_mode: string
          pickup_notice: string | null
          require_online_payment: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          auto_mark_picked_up?: boolean
          auto_print?: boolean
          enabled?: boolean
          estimated_minutes?: number
          field_email?: string
          field_first_name?: string
          field_last_name?: string
          field_phone?: string
          max_orders_per_hour?: number | null
          pickup_mode?: string
          pickup_notice?: string | null
          require_online_payment?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          auto_mark_picked_up?: boolean
          auto_print?: boolean
          enabled?: boolean
          estimated_minutes?: number
          field_email?: string
          field_first_name?: string
          field_last_name?: string
          field_phone?: string
          max_orders_per_hour?: number | null
          pickup_mode?: string
          pickup_notice?: string | null
          require_online_payment?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeaway_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_overview: { Args: never; Returns: Json }
      can_take_payments: { Args: { p_restaurant_id: string }; Returns: boolean }
      check_invite: { Args: { p_token: string }; Returns: Json }
      claim_fiscal_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          payload: Json
          receipt_id: string | null
          restaurant_id: string
          run_after: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fiscal_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pickup_items: {
        Args: { p_items: Json; p_order_id: string }
        Returns: undefined
      }
      close_table_session: {
        Args: { p_force?: boolean; p_session_id: string }
        Returns: undefined
      }
      create_public_booking: {
        Args: {
          p_email: string
          p_guests: number
          p_name: string
          p_notes?: string
          p_phone: string
          p_restaurant_id: string
          p_room_id?: string
          p_starts_at: string
        }
        Returns: string
      }
      current_custom_menu: {
        Args: { p_at?: string; p_restaurant_id: string }
        Returns: string
      }
      custom_menu_restaurant: { Args: { p_menu_id: string }; Returns: string }
      dish_orderable: {
        Args: { p_dish_id: string; p_restaurant_id: string }
        Returns: boolean
      }
      find_pickup: {
        Args: { p_code_or_token: string; p_restaurant_id: string }
        Returns: Json
      }
      get_public_config: { Args: never; Returns: Json }
      get_public_menu: {
        Args: { p_context?: string; p_restaurant_id: string }
        Returns: Json
      }
      get_public_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_table_entry: { Args: { p_qr_token: string }; Returns: Json }
      get_takeaway_display: { Args: { p_restaurant_id: string }; Returns: Json }
      get_takeaway_order: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: { p_restaurant_id: string; p_roles: string[] }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window: string }
        Returns: boolean
      }
      is_manager: { Args: { p_restaurant_id: string }; Returns: boolean }
      is_member: { Args: { p_restaurant_id: string }; Returns: boolean }
      is_owner: { Args: { p_restaurant_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_session_guest: { Args: { p_session_id: string }; Returns: boolean }
      join_table: { Args: { p_pin: string; p_qr_token: string }; Returns: Json }
      log_activity: {
        Args: { p_action: string; p_details?: Json; p_restaurant_id: string }
        Returns: undefined
      }
      maintenance: { Args: never; Returns: undefined }
      move_table_session: {
        Args: { p_session_id: string; p_table_id: string }
        Returns: undefined
      }
      next_pickup_number: { Args: { p_restaurant_id: string }; Returns: number }
      open_table_session: {
        Args: {
          p_ayce?: boolean
          p_cover?: boolean
          p_guests: number
          p_table_id: string
        }
        Returns: Json
      }
      place_takeaway_order: {
        Args: { p_customer: Json; p_items: Json; p_restaurant_id: string }
        Returns: Json
      }
      pricing_at: {
        Args: { p_at?: string; p_restaurant_id: string }
        Returns: {
          ayce_available: boolean
          ayce_interval_min: number
          ayce_max_rounds: number
          ayce_price: number
          cover_price: number
          period: string
        }[]
      }
      raise_app_error: {
        Args: { p_code: string; p_message: string }
        Returns: undefined
      }
      random_pickup_code: { Args: never; Returns: string }
      random_pin: { Args: never; Returns: string }
      record_payment: {
        Args: {
          p_amount: number
          p_label?: string
          p_method: string
          p_session_id: string
        }
        Returns: string
      }
      record_takeaway_payment: {
        Args: { p_method: string; p_order_id: string }
        Returns: string
      }
      regenerate_session_pin: {
        Args: { p_session_id: string }
        Returns: string
      }
      resolve_qr_code: { Args: { p_code: string }; Returns: string }
      restaurant_analytics: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: Json
      }
      session_bill: { Args: { p_session_id: string }; Returns: Json }
      session_restaurant: { Args: { p_session_id: string }; Returns: string }
      set_assistance: {
        Args: { p_requested: boolean; p_session_id: string }
        Returns: undefined
      }
      set_dish_availability: {
        Args: { p_available: boolean; p_dish_id: string }
        Returns: undefined
      }
      set_items_status: {
        Args: { p_item_ids: string[]; p_status: string }
        Returns: number
      }
      set_takeaway_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      storage_restaurant_id: { Args: { p_name: string }; Returns: string }
      submit_order: {
        Args: { p_items?: Json; p_session_id: string }
        Returns: string
      }
      visible_dish_ids: { Args: { p_restaurant_id: string }; Returns: string[] }
      was_session_guest: { Args: { p_session_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


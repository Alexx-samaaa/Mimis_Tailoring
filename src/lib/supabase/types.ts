export type Customer = {
  id: string
  first_name: string
  last_name: string
  contact_number: string
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type Measurement = {
  id: string
  customer_id: string
  garment_category: string
  garment_type: string
  measurement_values: Record<string, string | number>
  customization_details: Record<string, string | string[]>
  version: number
  notes: string | null
  created_at: string
}

export type Order = {
  id: string
  customer_id: string
  measurement_id: string | null
  order_type: 'Personal' | 'Bulk'
  garment_name: string
  garment_category: string | null
  customization_details: Record<string, string | string[]>
  measurement_snapshot: {
    id?: string
    version?: number
    garment_category?: string
    garment_type?: string
    measurement_values?: Record<string, string | number>
    customization_details?: Record<string, string | string[]>
    notes?: string | null
  } | null
  quantity: number
  unit_price: number
  total_price: number
  order_status: string
  order_date: string
  delivery_deadline: string | null
  delivery_deadline_at: string | null
  ready_for_pickup_at: string | null
  pickup_due_at: string | null
  picked_up_at: string | null
  cancelled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Appointment = {
  id: string
  customer_id: string
  order_id: string | null
  appointment_type: string
  appointment_date: string
  appointment_time: string
  status: string
  notes: string | null
  created_at: string
}

export type Payment = {
  id: string
  order_id: string
  amount: number
  payment_date: string
  payment_method: string
  notes: string | null
  created_at: string
}

export type Refund = {
  id: string
  order_id: string
  payment_id: string
  amount: number
  refund_date: string
  reason: string
  created_by: string | null
  created_at: string
}

export type BulkOrder = {
  id: string
  organization_name: string
  group_name: string | null
  contact_person: string
  contact_number: string
  order_date: string
  delivery_deadline: string | null
  delivery_deadline_at: string | null
  status: string
  notes: string | null
  created_at: string
}

export type BulkItem = {
  id: string
  bulk_order_id: string
  customer_id: string | null
  measurement_id: string | null
  individual_name: string
  garment_type: string
  size: string | null
  measurements: Record<string, string | number>
  customization_details: Record<string, string | string[]>
  quantity: number
  unit_price: number
  status: string
  notes: string | null
}

export type StatusHistory = {
  id: string
  order_id: string
  previous_status: string | null
  new_status: string
  notes: string | null
  changed_at: string
}

export type Notification = {
  id: string
  title: string
  message: string
  notification_type: string
  related_order_id: string | null
  related_customer_id: string | null
  is_read: boolean
  created_at: string
}

export type BusinessSettings = {
  id: string
  owner_id: string
  business_name: string
  contact_number: string | null
  address: string | null
  default_measurement_unit: string
  deadline_alert_days: number
  updated_at: string
}

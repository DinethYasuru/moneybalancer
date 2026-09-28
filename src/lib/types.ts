export interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
  is_default: boolean
  monthly_budget: number | null
  is_essential: boolean
}

export interface Expense {
  id: string
  category_id: string | null
  amount: number
  currency: string
  description: string | null
  expense_date: string
  is_recurring: boolean
  recurring_bill_id: string | null
  created_at: string
}

export interface RecurringBill {
  id: string
  category_id: string | null
  name: string
  expected_amount: number | null
  due_day: number | null
  is_active: boolean
}

export interface Attachment {
  id: string
  expense_id: string | null
  storage_path: string
  original_filename: string
  file_type: string
  file_size_bytes: number | null
  uploaded_at: string
}

export interface SavingsGoal {
  id: string
  name: string
  target_amount: number
  target_date: string | null
  current_amount: number
  created_at: string
}

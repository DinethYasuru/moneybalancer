export interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
  is_default: boolean
}

export interface Expense {
  id: string
  category_id: string | null
  amount: number
  currency: string
  description: string | null
  expense_date: string
  is_recurring: boolean
  created_at: string
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

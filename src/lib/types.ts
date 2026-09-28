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
  debt_id: string | null
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

export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'one_time'

export interface Income {
  id: string
  source: string
  amount: number
  frequency: IncomeFrequency
  received_date: string
  is_recurring: boolean
  created_at: string
}

export type DebtType = 'loan' | 'credit_card' | 'personal_lending' | 'other'
export type DeductionTrigger = 'fixed_date' | 'on_income'

export interface Debt {
  id: string
  name: string
  debt_type: DebtType
  lender: string | null
  principal_amount: number | null
  current_balance: number
  interest_rate: number | null
  minimum_payment: number | null
  due_day: number | null
  is_active: boolean
  auto_deduct: boolean
  deduction_trigger: DeductionTrigger | null
  created_at: string
}

export type AiProvider = 'openai_compatible' | 'anthropic'

export interface AiConfig {
  enabled: boolean
  provider: AiProvider
  base_url: string
  api_key: string
  model: string
}

export interface UserSettings {
  user_id: string
  currency: string
  accent_color: string
  dashboard_widgets: { income: boolean; debt: boolean; safeToSpend: boolean }
  ai_config: AiConfig
}

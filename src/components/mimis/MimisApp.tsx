'use client'

import {
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Scissors,
  Search,
  Settings,
  ShoppingBag,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type {
  Appointment,
  BulkItem,
  BulkOrder,
  BusinessSettings,
  Customer,
  Measurement,
  Notification,
  Order,
  Payment,
  Refund,
  StatusHistory,
} from '@/lib/supabase/types'
import {
  customizationFieldsFor,
  fieldLabel,
  GARMENTS,
  MEASUREMENT_LIMITS,
  measurementFieldsFor,
  NAVIGATION,
  ORDER_STATUSES,
} from './constants'
import { Mannequin } from './Mannequin'

type View =
  | 'dashboard'
  | 'customers'
  | 'measurements'
  | 'orders'
  | 'fittings'
  | 'reports'
  | 'settings'

type DataState = {
  customers: Customer[]
  measurements: Measurement[]
  orders: Order[]
  appointments: Appointment[]
  payments: Payment[]
  refunds: Refund[]
  bulkOrders: BulkOrder[]
  bulkItems: BulkItem[]
  history: StatusHistory[]
  notifications: Notification[]
  settings: BusinessSettings | null
}

const EMPTY_DATA: DataState = {
  customers: [],
  measurements: [],
  orders: [],
  appointments: [],
  payments: [],
  refunds: [],
  bulkOrders: [],
  bulkItems: [],
  history: [],
  notifications: [],
  settings: null,
}

const navIcons = [LayoutDashboard, Users, Ruler, ShoppingBag, CalendarDays, BarChart3, Settings]

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value || 0)

const shortDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(`${value.slice(0, 10)}T00:00:00+08:00`))
    : '—'
const shortDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '—'

const manilaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const today = () => manilaDate.format(new Date())
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const customerName = (customer?: Customer) =>
  customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown customer'
const PAGE_SIZE = 10
const ARCHIVED_ORDER_STATUSES = ['Completed', 'Cancelled']
const ACTIVE_ORDER_STATUSES = ORDER_STATUSES.filter(
  (status) => !ARCHIVED_ORDER_STATUSES.includes(status),
)
const recoveryRedirectUrl = () => new URL('/auth/reset-password', window.location.origin).toString()
const localDateTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
const appointmentTimestamp = (appointment: Appointment) =>
  new Date(
    `${appointment.appointment_date}T${appointment.appointment_time.slice(0, 8)}+08:00`,
  ).getTime()

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f231d]/45 p-4 backdrop-blur-[2px]">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-[24px] border border-[#dfd2c5] bg-[#fffdfa] shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadfd6] bg-[#fffdfa]/95 px-6 py-4 backdrop-blur">
          <h2 className="font-serif text-xl font-semibold text-[#39271f]">{title}</h2>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-[#5f4a3d] ${className}`}>
      {label}
      {children}
    </label>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d8c8ba] bg-[#fcf8f3] px-6 py-12 text-center">
      <Scissors className="mx-auto mb-3 text-[#a58670]" size={28} />
      <h3 className="font-serif text-lg font-semibold text-[#49382d]">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#826f62]">{text}</p>
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  const danger = value === 'Cancelled' || value === 'Overdue'
  const done = value === 'Completed' || value === 'Fully Paid' || value === 'Fully Refunded'
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        danger
          ? 'bg-[#f5e1dd] text-[#9a463b]'
          : done
            ? 'bg-[#e3ece2] text-[#4f6e4d]'
            : 'bg-[#eee3d9] text-[#745542]'
      }`}
    >
      {value}
    </span>
  )
}

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setMessage(error.message)
    if (data.session) onSession(data.session)
  }

  async function resetPassword() {
    if (!email) return setMessage('Enter your administrator email first.')
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl(),
    })
    setLoading(false)
    setMessage(error ? error.message : 'Password reset instructions have been sent to your email.')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4ede5] p-5">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[30px] border border-[#ded0c2] bg-[#fffdfa] shadow-[0_24px_70px_rgba(77,53,39,.14)] md:grid-cols-[1.05fr_.95fr]">
        <section className="hidden bg-[#49382d] p-12 text-[#fffaf4] md:flex md:flex-col md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/20 bg-white/10">
              <Scissors size={22} />
            </span>
            <div>
              <p className="font-serif text-xl font-semibold">Mimi&apos;s Tailoring</p>
              <p className="text-xs tracking-[.16em] text-[#dac8bb]">STUDIO MANAGEMENT</p>
            </div>
          </div>
          <div>
            <p className="font-serif text-4xl leading-tight">
              Craft every order with care and confidence.
            </p>
          </div>
          <p className="text-xs text-[#bba99d]">Authorized administrators only</p>
        </section>
        <section className="p-7 sm:p-11">
          <div className="mb-8 md:hidden">
            <Scissors className="mb-3 text-[#6f4e3a]" />
            <p className="font-serif text-xl font-semibold">Mimi&apos;s Tailoring</p>
          </div>
          <p className="eyebrow">WELCOME BACK</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-[#39271f]">
            Administrator login
          </h1>

          <form className="mt-7 grid gap-4" onSubmit={submit}>
            <Field label="Email address">
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="pr-12"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b786c] hover:text-[#6f4e3a]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            {message && (
              <p className="rounded-xl bg-[#f6ece4] px-3 py-2 text-sm text-[#79513e]">{message}</p>
            )}

            <button className="primary-button mt-2 justify-center" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              className="text-sm font-medium text-[#795946] hover:underline"
              onClick={resetPassword}
              type="button"
            >
              Forgot password?
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) return setMessage('Use at least 8 characters for the new password.')
    if (password !== confirmation) return setMessage('The passwords do not match.')
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setMessage(error.message)
    window.history.replaceState({}, '', window.location.pathname)
    setMessage('Your password was updated successfully.')
    window.setTimeout(onComplete, 1000)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4ede5] p-5">
      <section className="w-full max-w-md rounded-[30px] border border-[#ded0c2] bg-[#fffdfa] p-8 shadow-[0_24px_70px_rgba(77,53,39,.14)]">
        <Scissors className="mb-5 text-[#6f4e3a]" />
        <p className="eyebrow">SECURE ACCOUNT</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-[#39271f]">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-[#806f63]">
          Enter and confirm the new password for your administrator account.
        </p>
        <form className="mt-7 grid gap-4" onSubmit={submit}>
          <Field label="New password">
            <input
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          {message && (
            <p className="rounded-xl bg-[#f6ece4] px-3 py-2 text-sm text-[#79513e]">{message}</p>
          )}
          <button className="primary-button justify-center" disabled={loading}>
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default function MimisApp({ view }: { view: View }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [data, setData] = useState<DataState>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState('')
  const [notice, setNotice] = useState('')
  const [cancelOrderTarget, setCancelOrderTarget] = useState<Order | null>(null)
  const [restoreOrderTarget, setRestoreOrderTarget] = useState<Order | null>(null)
  const [restoreBulkOrderTarget, setRestoreBulkOrderTarget] = useState<BulkOrder | null>(null)
  const [restoreStatus, setRestoreStatus] = useState('Pending')
  const [cancelBulkOrderTarget, setCancelBulkOrderTarget] = useState<string | null>(null)
  const [archiveCustomerTarget, setArchiveCustomerTarget] = useState<Customer | null>(null)
  const [deleteMeasurementTarget, setDeleteMeasurementTarget] = useState<Measurement | null>(null)
  const [savingPayment, setSavingPayment] = useState(false)
  const [savingRefund, setSavingRefund] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [modal, setModal] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [editingMeasurement, setEditingMeasurement] = useState<Measurement | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editingBulkOrder, setEditingBulkOrder] = useState<BulkOrder | null>(null)
  const [editingBulkItem, setEditingBulkItem] = useState<BulkItem | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [deadlineFilter, setDeadlineFilter] = useState('All')
  const [reportRange, setReportRange] = useState('This Month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [orderMode, setOrderMode] = useState<'personal' | 'bulk'>('personal')
  const [measurementDraft, setMeasurementDraft] = useState({
    customerId: '',
    category: 'Tops',
    garmentType: 'Blouse',
    values: {} as Record<string, string>,
    customizations: {
      sleeveStyle: 'Short sleeve',
      necklineStyle: 'Round neck',
      backStyle: 'Regular back',
      fitStyle: 'Regular fit',
      garmentSilhouette: 'A-line',
      additionalNotes: '',
    },
    notes: '',
  })
  const savingOrderRef = useRef(false)
  const savingPaymentRef = useRef(false)
  const savingRefundRef = useRef(false)

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setSetupError('')
    const { error: notificationError } = await supabase.rpc('refresh_system_notifications')
    const requests = [
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('measurements').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').order('appointment_date'),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('refunds').select('*').order('refund_date', { ascending: false }),
      supabase.from('bulk_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('bulk_order_items').select('*'),
      supabase.from('order_status_history').select('*').order('changed_at', { ascending: false }),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      supabase.from('business_settings').select('*').maybeSingle(),
    ]
    const results = await Promise.all(requests)
    const firstError = results.find((result) => result.error)?.error
    if (firstError) {
      setSetupError(firstError.message)
      setLoading(false)
      return
    }
    setData({
      customers: (results[0].data || []) as Customer[],
      measurements: (results[1].data || []) as Measurement[],
      orders: (results[2].data || []) as Order[],
      appointments: (results[3].data || []) as Appointment[],
      payments: (results[4].data || []) as Payment[],
      refunds: (results[5].data || []) as Refund[],
      bulkOrders: (results[6].data || []) as BulkOrder[],
      bulkItems: (results[7].data || []) as BulkItem[],
      history: (results[8].data || []) as StatusHistory[],
      notifications: (results[9].data || []) as Notification[],
      settings: results[10].data as BusinessSettings | null,
    })
    if (notificationError) {
      showNotice(
        `Records refreshed, but notifications could not be refreshed: ${notificationError.message}`,
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setSession(nextSession)
    })
    supabase.auth
      .getSession()
      .then(({ data: auth, error }) => {
        if (error) setSetupError(error.message)
        setSession(auth.session)
        if (auth.session && window.location.pathname === '/auth/reset-password') {
          setRecoveryMode(true)
        }
      })
      .finally(() => setAuthReady(true))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadData()
    else setLoading(false)
  }, [session, loadData])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, categoryFilter, deadlineFilter, orderMode, view, pathname])

  useEffect(() => {
    setStatusFilter('All')
  }, [pathname])

  useEffect(() => {
    setDetailPage(1)
  }, [selectedOrder?.id])

  useEffect(() => {
    setPage(1)
  }, [measurementDraft.customerId])

  const activeCustomers = data.customers.filter((customer) => !customer.archived_at)
  const findCustomer = (id: string) => data.customers.find((item) => item.id === id)
  const paidFor = (orderId: string) =>
    data.payments
      .filter((payment) => payment.order_id === orderId)
      .reduce((sum, payment) => sum + Number(payment.amount), 0)
  const refundedFor = (orderId: string) =>
    data.refunds
      .filter((refund) => refund.order_id === orderId)
      .reduce((sum, refund) => sum + Number(refund.amount), 0)
  const refundedFromPayment = (paymentId: string) =>
    data.refunds
      .filter((refund) => refund.payment_id === paymentId)
      .reduce((sum, refund) => sum + Number(refund.amount), 0)
  const refundStatusFor = (orderId: string) => {
    const paid = paidFor(orderId)
    const refunded = refundedFor(orderId)
    if (refunded <= 0 || paid <= 0) return 'Not Refunded'
    return refunded >= paid ? 'Fully Refunded' : 'Partially Refunded'
  }
  const isOverdue = (order: Order) =>
    Boolean(
      (order.delivery_deadline_at
        ? new Date(order.delivery_deadline_at).getTime() < Date.now()
        : order.delivery_deadline && order.delivery_deadline < today()) &&
      !['Ready for Pickup', 'Completed', 'Cancelled'].includes(order.order_status),
    )
  const isLatePickup = (order: Order) =>
    order.order_status === 'Ready for Pickup' &&
    Boolean(order.pickup_due_at) &&
    new Date(order.pickup_due_at as string).getTime() < Date.now()
  const wasProducedLate = (order: Order) =>
    Boolean(
      order.ready_for_pickup_at &&
      order.delivery_deadline_at &&
      new Date(order.ready_for_pickup_at).getTime() >
        new Date(order.delivery_deadline_at).getTime(),
    )
  const orderDeadline = (order: Order) =>
    order.delivery_deadline_at
      ? shortDateTime(order.delivery_deadline_at)
      : shortDate(order.delivery_deadline)

  const reportBounds = useMemo(() => {
    const end = today()
    if (reportRange === 'Custom Date Range') {
      return { from: customFrom || '0000-01-01', to: customTo || '9999-12-31' }
    }
    if (reportRange === 'Today') return { from: end, to: end }
    if (reportRange === 'This Week') {
      const day = new Date(`${end}T12:00:00Z`).getUTCDay()
      return { from: addDays(end, -day), to: end }
    }
    if (reportRange === 'This Year') {
      return { from: `${end.slice(0, 4)}-01-01`, to: end }
    }
    return {
      from: `${end.slice(0, 7)}-01`,
      to: end,
    }
  }, [reportRange, customFrom, customTo])

  const reportOrders = data.orders.filter(
    (order) => order.order_date >= reportBounds.from && order.order_date <= reportBounds.to,
  )
  const reportPayments = data.payments.filter(
    (payment) =>
      payment.payment_date >= reportBounds.from && payment.payment_date <= reportBounds.to,
  )
  const reportRefunds = data.refunds.filter(
    (refund) => refund.refund_date >= reportBounds.from && refund.refund_date <= reportBounds.to,
  )
  const reportMetrics = {
    totalSales: reportOrders
      .filter((order) => order.order_status === 'Completed')
      .reduce((sum, order) => sum + Number(order.total_price), 0),
    paymentsReceived: reportPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    refundsIssued: reportRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0),
    outstandingBalance: reportOrders
      .filter((order) => !ARCHIVED_ORDER_STATUSES.includes(order.order_status))
      .reduce((sum, order) => sum + Math.max(0, Number(order.total_price) - paidFor(order.id)), 0),
  }
  const netPaymentsRetained = reportMetrics.paymentsReceived - reportMetrics.refundsIssued
  const dashboard = useMemo(() => {
    const activeOrders = data.orders.filter(
      (order) => !ARCHIVED_ORDER_STATUSES.includes(order.order_status),
    )
    return {
      totalCustomers: activeCustomers.length,
      totalOrders: activeOrders.length,
      pending: activeOrders.filter((order) => order.order_status === 'Pending').length,
      progress: activeOrders.filter((order) => order.order_status === 'In Progress').length,
      fitting: activeOrders.filter((order) => order.order_status === 'For Fitting').length,
      ready: activeOrders.filter((order) => order.order_status === 'Ready for Pickup').length,
      overdue: activeOrders.filter(isOverdue).length,
    }
  }, [data.customers, data.orders])

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)

    const payload = {
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      contact_number: String(form.get('contact_number') || '').trim(),
      address: String(form.get('address') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
    }

    if (!payload.first_name || !payload.last_name || !payload.contact_number) {
      return showNotice('First name, last name, and contact number are required.')
    }

    if (editingCustomer) {
      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)
        .select('id')
        .maybeSingle()

      if (error) return showNotice(error.message)

      if (!data) {
        return showNotice('Customer was not updated. Please check the record and permissions.')
      }

      setModal(null)
      setEditingCustomer(null)
      showNotice('Customer updated.')
      loadData()
      return
    }

    const { error } = await supabase.from('customers').insert(payload)

    if (error) return showNotice(error.message)

    setModal(null)
    setEditingCustomer(null)
    showNotice('Customer added.')
    loadData()
  }

  async function archiveCustomer(customer: Customer, confirmed = false) {
    if (!confirmed) {
      setArchiveCustomerTarget(customer)
      return
    }

    const { data: archived, error } = await supabase
      .from('customers')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', customer.id)
      .select('id')
      .maybeSingle()

    if (error) return showNotice(error.message)

    if (!archived) {
      return showNotice('Customer was not archived. Please refresh and try again.')
    }

    setArchiveCustomerTarget(null)
    showNotice('Customer archived.')
    loadData()
  }

  async function restoreCustomer(customer: Customer) {
    const { data: restored, error } = await supabase
      .from('customers')
      .update({ archived_at: null })
      .eq('id', customer.id)
      .select('id')
      .maybeSingle()
    if (error) return showNotice(error.message)
    if (!restored) return showNotice('Customer was not restored. Please refresh and try again.')
    showNotice('Customer restored.')
    loadData()
  }

  async function saveMeasurement(event: FormEvent) {
    event.preventDefault()
    if (!measurementDraft.customerId) return showNotice('Select a customer.')
    const relevantFields = measurementFieldsFor(
      measurementDraft.category,
      measurementDraft.garmentType,
      measurementDraft.customizations.sleeveStyle,
    )
    const values = Object.fromEntries(
      Object.entries(measurementDraft.values).filter(
        ([key, value]) => relevantFields.includes(key) && value !== '',
      ),
    )
    const invalid = Object.entries(values).find(([key, value]) => {
      const limit = MEASUREMENT_LIMITS[key]
      const number = Number(value)
      return !limit || !Number.isFinite(number) || number < limit.min || number > limit.max
    })
    if (invalid) {
      const [key] = invalid
      const limit = MEASUREMENT_LIMITS[key]
      return showNotice(`${fieldLabel(key)} must be between ${limit.min} and ${limit.max} inches.`)
    }
    const required = relevantFields.filter((key) => MEASUREMENT_LIMITS[key]?.required)
    const missing = required.find((key) => !values[key])
    if (missing) return showNotice(`${fieldLabel(missing)} is required.`)
    const applicableCustomizations = customizationFieldsFor(
      measurementDraft.category,
      measurementDraft.garmentType,
    )
    const customizations = Object.fromEntries(
      Object.entries(measurementDraft.customizations).filter(
        ([key]) =>
          key === 'additionalNotes' ||
          applicableCustomizations[key as keyof typeof applicableCustomizations],
      ),
    )
    const { data: savedId, error } = await supabase.rpc('save_measurement_version', {
      measurement_payload: {
        customer_id: measurementDraft.customerId,
        garment_category: measurementDraft.category,
        garment_type: measurementDraft.garmentType,
        measurement_values: values,
        customization_details: customizations,
        notes: measurementDraft.notes,
      },
      existing_measurement_id: editingMeasurement?.id || null,
    })
    if (error) return showNotice(error.message)
    const savedVersion = editingMeasurement?.version
    showNotice(
      editingMeasurement ? `Version ${savedVersion} updated.` : 'New measurement version saved.',
    )
    void savedId
    setEditingMeasurement(null)
    setMeasurementDraft((draft) => ({ ...draft, values: {}, notes: '' }))
    loadData()
  }

  function viewMeasurement(measurement: Measurement) {
    setEditingMeasurement(measurement)
    setMeasurementDraft({
      customerId: measurement.customer_id,
      category: measurement.garment_category,
      garmentType: measurement.garment_type,
      values: Object.fromEntries(
        Object.entries(measurement.measurement_values).map(([key, value]) => [key, String(value)]),
      ),
      customizations: {
        sleeveStyle: String(measurement.customization_details.sleeveStyle || 'Short sleeve'),
        necklineStyle: String(measurement.customization_details.necklineStyle || 'Round neck'),
        backStyle: String(measurement.customization_details.backStyle || 'Regular back'),
        fitStyle: String(measurement.customization_details.fitStyle || 'Regular fit'),
        garmentSilhouette: String(measurement.customization_details.garmentSilhouette || 'A-line'),
        additionalNotes: String(measurement.customization_details.additionalNotes || ''),
      },
      notes: measurement.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function newMeasurementVersion() {
    setEditingMeasurement(null)
    setMeasurementDraft((draft) => ({ ...draft, values: {}, notes: '' }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteMeasurement(measurement: Measurement, confirmed = false) {
    if (!confirmed) {
      setDeleteMeasurementTarget(measurement)
      return
    }

    const { error } = await supabase.from('measurements').delete().eq('id', measurement.id)

    if (error) {
      return showNotice(
        error.code === '23503'
          ? 'This version is linked to an order and cannot be deleted.'
          : error.message,
      )
    }

    setDeleteMeasurementTarget(null)

    if (editingMeasurement?.id === measurement.id) newMeasurementVersion()

    showNotice(`Version ${measurement.version} deleted.`)
    loadData()
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingOrderRef.current) return
    const form = new FormData(event.currentTarget)
    const quantity = Math.max(1, Number(form.get('quantity')))
    const unitPrice = Math.max(0, Number(form.get('unit_price')))
    const measurementId = String(form.get('measurement_id') || '')
    const measurement = data.measurements.find((item) => item.id === measurementId)
    if (measurement && measurement.customer_id !== form.get('customer_id')) {
      return showNotice('The selected measurement does not belong to this customer.')
    }
    const deadlineLocal = String(form.get('delivery_deadline_at') || '')
    const payload = {
      customer_id: form.get('customer_id'),
      measurement_id: measurementId,
      order_type: 'Personal',
      garment_name: measurement?.garment_type || form.get('garment_name'),
      garment_category: measurement?.garment_category || form.get('garment_category'),
      quantity,
      unit_price: unitPrice,
      order_status: 'Pending',
      order_date: form.get('order_date'),
      delivery_deadline: form.get('delivery_deadline'),
      delivery_deadline_at: deadlineLocal
        ? new Date(`${deadlineLocal}:00+08:00`).toISOString()
        : null,
      notes: form.get('notes'),
      customization_details: measurement?.customization_details || {
        sleeveStyle: form.get('sleeve_style'),
        necklineStyle: form.get('neckline_style'),
        fitStyle: form.get('fit_style'),
        additionalNotes: form.get('customization_notes'),
      },
    }
    if (!payload.customer_id || !payload.garment_name)
      return showNotice('Customer and garment name are required.')
    savingOrderRef.current = true
    const { error } = editingOrder
      ? await supabase.rpc('update_order_preserving_history', {
          target_order_id: editingOrder.id,
          order_payload: payload,
        })
      : await supabase.rpc('create_order_with_history', {
          order_payload: payload,
        })
    savingOrderRef.current = false
    if (error) return showNotice(error.message)
    setModal(null)
    setEditingOrder(null)
    showNotice(editingOrder ? 'Order updated.' : 'Order created.')
    loadData()
  }

  async function changeOrderStatus(order: Order, status: string, confirmed = false) {
    if (status === 'Cancelled' && !confirmed) {
      setCancelOrderTarget(order)
      return
    }

    const { data: updated, error } = await supabase
      .from('orders')
      .update({ order_status: status })
      .eq('id', order.id)
      .select('id')
      .maybeSingle()

    if (error) return showNotice(error.message)

    if (!updated)
      return showNotice('The order status was not updated. Please refresh and try again.')

    if (selectedOrder?.id === order.id) {
      setSelectedOrder({ ...selectedOrder, order_status: status })
    }

    setCancelOrderTarget(null)
    showNotice(`Order moved to ${status}.`)
    loadData()
  }

  async function restoreOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!restoreOrderTarget && !restoreBulkOrderTarget) return
    const { error } = restoreOrderTarget
      ? await supabase.rpc('restore_order', {
          target_order_id: restoreOrderTarget.id,
          restored_status: restoreStatus,
        })
      : await supabase.rpc('restore_bulk_order', {
          target_bulk_order_id: restoreBulkOrderTarget?.id,
          restored_status: restoreStatus,
        })
    if (error) return showNotice(error.message)
    if (restoreOrderTarget && selectedOrder?.id === restoreOrderTarget.id) {
      setSelectedOrder({ ...selectedOrder, order_status: restoreStatus })
    }
    setRestoreOrderTarget(null)
    setRestoreBulkOrderTarget(null)
    showNotice(`Order restored as ${restoreStatus}.`)
    loadData()
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrder || savingPaymentRef.current) return
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const balance =
      Number(selectedOrder.total_price) -
      paidFor(selectedOrder.id) +
      Number(editingPayment?.amount || 0)
    if (amount <= 0 || amount > balance)
      return showNotice(`Enter a payment up to the remaining balance of ${money(balance)}.`)
    savingPaymentRef.current = true
    setSavingPayment(true)
    const payload = {
      order_id: selectedOrder.id,
      amount,
      payment_date: form.get('payment_date'),
      payment_method: form.get('payment_method'),
      notes: form.get('notes'),
    }
    const request = editingPayment
      ? supabase.from('payments').update(payload).eq('id', editingPayment.id)
      : supabase.from('payments').insert(payload)
    const { data: saved, error } = await request.select('id').maybeSingle()
    savingPaymentRef.current = false
    setSavingPayment(false)
    if (error) return showNotice(error.message)
    if (!saved) return showNotice('The payment was not saved. Please refresh and try again.')
    showNotice(editingPayment ? 'Payment correction recorded.' : 'Payment recorded.')
    setEditingPayment(null)
    setModal('order-details')
    loadData()
  }

  async function saveRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrder || selectedOrder.order_status !== 'Cancelled' || savingRefundRef.current)
      return
    const form = new FormData(event.currentTarget)
    const paymentId = String(form.get('payment_id') || '')
    const payment = data.payments.find(
      (item) => item.id === paymentId && item.order_id === selectedOrder.id,
    )
    const amount = Number(form.get('amount'))
    const reason = String(form.get('reason') || '').trim()
    const confirmed = form.get('money_returned') === 'on'
    if (!payment) return showNotice('Choose the payment that was refunded.')
    const refundable = Number(payment.amount) - refundedFromPayment(payment.id)
    if (amount <= 0 || amount > refundable) {
      return showNotice(`Enter a refund up to ${money(refundable)} for this payment.`)
    }
    if (!reason) return showNotice('Enter the reason for the refund.')
    if (!confirmed) return showNotice('Confirm that the money has actually been returned.')
    savingRefundRef.current = true
    setSavingRefund(true)
    const { data: saved, error } = await supabase
      .from('refunds')
      .insert({
        order_id: selectedOrder.id,
        payment_id: payment.id,
        amount,
        refund_date: form.get('refund_date'),
        reason,
      })
      .select('id')
      .maybeSingle()
    savingRefundRef.current = false
    setSavingRefund(false)
    if (error) return showNotice(error.message)
    if (!saved) return showNotice('The refund was not recorded. Please refresh and try again.')
    showNotice('Refund recorded.')
    setModal('order-details')
    loadData()
  }

  function reorder(order: Order) {
    setSelectedOrder(order)
    setModal('reorder')
  }

  async function submitReorder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrder) return
    const form = new FormData(event.currentTarget)
    const payload = {
      customer_id: selectedOrder.customer_id,
      measurement_id: form.get('measurement_id') || selectedOrder.measurement_id || '',
      order_type: 'Personal',
      garment_name: form.get('garment_name'),
      garment_category: form.get('garment_category'),
      quantity: Number(form.get('quantity')),
      unit_price: Number(form.get('unit_price')),
      order_status: 'Pending',
      order_date: today(),
      delivery_deadline: form.get('delivery_deadline'),
      notes: form.get('notes'),
      customization_details: {
        ...selectedOrder.customization_details,
        sleeveStyle: form.get('sleeve_style'),
        fitStyle: form.get('fit_style'),
        additionalNotes: form.get('customization_notes'),
      },
    }
    const { error } = await supabase.rpc('create_order_with_history', {
      order_payload: payload,
    })
    if (error) return showNotice(error.message)
    setModal(null)
    showNotice('Reorder created. The original order remains unchanged.')
    loadData()
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      customer_id: form.get('customer_id'),
      order_id: form.get('order_id') || null,
      appointment_type: form.get('appointment_type'),
      appointment_date: form.get('appointment_date'),
      appointment_time: form.get('appointment_time'),
      status: selectedAppointment ? 'Rescheduled' : 'Scheduled',
      notes: form.get('notes'),
    }
    const request = selectedAppointment
      ? supabase.from('appointments').update(payload).eq('id', selectedAppointment.id)
      : supabase.from('appointments').insert(payload)
    const { data: saved, error } = await request.select('id').maybeSingle()
    if (error) return showNotice(error.message)
    if (!saved)
      return showNotice('The fitting schedule was not saved. Please refresh and try again.')
    setModal(null)
    setSelectedAppointment(null)
    showNotice(
      selectedAppointment ? 'Fitting appointment updated.' : 'Fitting appointment scheduled.',
    )
    loadData()
  }

  async function changeAppointment(appointment: Appointment, status: string) {
    const { data: updated, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appointment.id)
      .select('id')
      .maybeSingle()
    if (error) return showNotice(error.message)
    if (!updated)
      return showNotice('The fitting status was not updated. Please refresh and try again.')
    showNotice(`Appointment marked ${status.toLowerCase()}.`)
    loadData()
  }

  async function saveBulkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const deadlineLocal = String(form.get('delivery_deadline_at') || '')
    const payload = {
      organization_name: form.get('organization_name'),
      group_name: form.get('group_name'),
      contact_person: form.get('contact_person'),
      contact_number: form.get('contact_number'),
      order_date: form.get('order_date'),
      delivery_deadline: form.get('delivery_deadline'),
      delivery_deadline_at: deadlineLocal
        ? new Date(`${deadlineLocal}:00+08:00`).toISOString()
        : null,
      status: 'Pending',
      notes: form.get('notes'),
    }
    const request = editingBulkOrder
      ? supabase
          .from('bulk_orders')
          .update({ ...payload, status: editingBulkOrder.status })
          .eq('id', editingBulkOrder.id)
      : supabase.from('bulk_orders').insert(payload)
    const { data: saved, error } = await request.select('id').maybeSingle()
    if (error) return showNotice(error.message)
    if (!saved) return showNotice('The bulk order was not saved. Please refresh and try again.')
    setModal(null)
    setEditingBulkOrder(null)
    showNotice(editingBulkOrder ? 'Bulk order updated.' : 'Bulk order created.')
    loadData()
  }

  async function saveBulkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)

    const bulkOrderId = String(form.get('bulk_order_id') || '').trim()
    const customerId = String(form.get('customer_id') || '').trim()
    const measurementId = String(form.get('measurement_id') || '').trim()
    const individualName = String(form.get('individual_name') || '').trim()
    const enteredGarmentType = String(form.get('garment_type') || '').trim()
    const quantity = Number(form.get('quantity'))
    const unitPrice = Number(form.get('unit_price'))

    if (!bulkOrderId) {
      return showNotice('Please select a bulk order.')
    }

    if (!individualName) {
      return showNotice('Student or individual name is required.')
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return showNotice('Quantity must be at least 1.')
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return showNotice('Please enter a valid unit price.')
    }

    const selectedMeasurement = measurementId
      ? data.measurements.find((item) => item.id === measurementId)
      : null

    if (measurementId && !selectedMeasurement) {
      return showNotice('Selected measurement was not found. Please refresh and try again.')
    }

    if (selectedMeasurement && selectedMeasurement.customer_id !== customerId) {
      return showNotice('The selected measurement does not belong to the selected customer.')
    }

    const garmentType = selectedMeasurement ? selectedMeasurement.garment_type : enteredGarmentType

    if (!garmentType) {
      return showNotice('Garment type is required when no measurement is linked.')
    }

    const payload = {
      bulk_order_id: bulkOrderId,
      customer_id: customerId || null,
      measurement_id: measurementId || null,
      individual_name: individualName,
      garment_type: garmentType,
      size: String(form.get('size') || '').trim() || null,
      quantity,
      unit_price: unitPrice,
      status: 'Pending',
      measurements: selectedMeasurement ? selectedMeasurement.measurement_values : {},
      customization_details: selectedMeasurement ? selectedMeasurement.customization_details : {},
      notes: String(form.get('notes') || '').trim() || null,
    }

    const request = editingBulkItem
      ? supabase
          .from('bulk_order_items')
          .update({ ...payload, status: editingBulkItem.status })
          .eq('id', editingBulkItem.id)
      : supabase.from('bulk_order_items').insert(payload)
    const { data: saved, error } = await request.select('id').maybeSingle()

    if (error) return showNotice(error.message)
    if (!saved)
      return showNotice('The bulk-order entry was not saved. Please refresh and try again.')

    setModal(null)
    setEditingBulkItem(null)
    showNotice(
      editingBulkItem
        ? 'Individual bulk-order entry updated.'
        : 'Individual bulk-order entry added.',
    )
    loadData()
  }

  async function updateBulkOrderStatus(id: string, status: string, confirmed = false) {
    if (status === 'Cancelled' && !confirmed) {
      setCancelBulkOrderTarget(id)
      return
    }

    const { data: updated, error } = await supabase
      .from('bulk_orders')
      .update({ status })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) return showNotice(error.message)

    if (!updated)
      return showNotice('The bulk-order status was not updated. Please refresh and try again.')

    setCancelBulkOrderTarget(null)
    showNotice('Bulk-order status updated.')
    loadData()
  }

  async function updateBulkItemStatus(id: string, status: string) {
    const { data: updated, error } = await supabase
      .from('bulk_order_items')
      .update({ status })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return showNotice(error.message)
    if (!updated)
      return showNotice('The individual status was not updated. Please refresh and try again.')
    showNotice('Individual progress updated.')
    loadData()
  }

  async function markNotificationsRead(id?: string) {
    let query = supabase.from('notifications').update({ is_read: true })
    query = id ? query.eq('id', id) : query.eq('is_read', false)
    const { error } = await query
    if (error) return showNotice(error.message)
    loadData()
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    const form = new FormData(event.currentTarget)
    const payload = {
      owner_id: session.user.id,
      business_name: form.get('business_name'),
      contact_number: form.get('contact_number'),
      address: form.get('address'),
      default_measurement_unit: 'inches',
      deadline_alert_days: Number(form.get('deadline_alert_days')),
    }
    const { error } = await supabase
      .from('business_settings')
      .upsert(payload, { onConflict: 'owner_id' })
    if (error) return showNotice(error.message)
    showNotice('Business preferences saved.')
    loadData()
  }

  async function exportExcel() {
    const rows = reportOrders.map((order) => ({
      Order: order.id.slice(0, 8).toUpperCase(),
      Customer: customerName(findCustomer(order.customer_id)),
      Garment: order.garment_name,
      Status: order.order_status,
      Total: Number(order.total_price),
      Paid: paidFor(order.id),
      Refunded: refundedFor(order.id),
      Balance: ARCHIVED_ORDER_STATUSES.includes(order.order_status)
        ? 0
        : Math.max(0, Number(order.total_price) - paidFor(order.id)),
      Deadline: order.delivery_deadline || '',
    }))
    const columns = [
      'Order',
      'Customer',
      'Garment',
      'Status',
      'Total',
      'Paid',
      'Refunded',
      'Balance',
      'Deadline',
    ]
    const escapeXml = (value: unknown) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')
    const cell = (value: unknown, numeric = false) =>
      `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeXml(value)}</Data></Cell>`
    const worksheetRows = [
      `<Row>${columns.map((column) => cell(column)).join('')}</Row>`,
      ...rows.map(
        (row) =>
          `<Row>${columns
            .map((column) =>
              cell(
                row[column as keyof typeof row],
                ['Total', 'Paid', 'Refunded', 'Balance'].includes(column),
              ),
            )
            .join('')}</Row>`,
      ),
    ].join('')
    const summaryRows = [
      ['Metric', 'Amount'],
      ['Total Sales', reportMetrics.totalSales],
      ['Payments Received', reportMetrics.paymentsReceived],
      ['Refunds Issued', reportMetrics.refundsIssued],
      ['Net Payments Retained', netPaymentsRetained],
      ['Outstanding Balance', reportMetrics.outstandingBalance],
    ]
      .map(([label, amount], index) => `<Row>${cell(label)}${cell(amount, index > 0)}</Row>`)
      .join('')
    const workbook = `<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Summary"><Table>${summaryRows}</Table></Worksheet>
        <Worksheet ss:Name="Orders"><Table>${worksheetRows}</Table></Worksheet>
      </Workbook>`
    const url = URL.createObjectURL(
      new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    )
    const download = document.createElement('a')
    download.href = url
    download.download = `mimis-tailoring-report-${today()}.xls`
    download.click()
    URL.revokeObjectURL(url)
  }

  async function exportPdf() {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.text("Mimi's Tailoring — Business Report", 16, 18)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(`Generated ${shortDate(today())}`, 16, 26)
    const lines = [
      `Total Sales: ${money(reportMetrics.totalSales)}`,
      `Payments Received: ${money(reportMetrics.paymentsReceived)}`,
      `Refunds Issued: ${money(reportMetrics.refundsIssued)}`,
      `Net Payments Retained: ${money(netPaymentsRetained)}`,
      `Outstanding Balance: ${money(reportMetrics.outstandingBalance)}`,
    ]
    lines.forEach((line, index) => pdf.text(line, 16, 40 + index * 8))
    pdf.save(`mimis-tailoring-report-${today()}.pdf`)
  }

  if (!authReady)
    return <div className="grid min-h-screen place-items-center bg-[#f4ede5]">Loading…</div>
  if (recoveryMode && session)
    return (
      <PasswordRecovery
        onComplete={() => {
          setRecoveryMode(false)
          router.replace('/')
        }}
      />
    )
  if (!session) return <Login onSession={setSession} />

  const unreadCount = data.notifications.filter((item) => !item.is_read).length
  const pageTitle =
    pathname === '/customers/archived'
      ? 'Archived Customers'
      : pathname === '/orders/archived'
        ? 'Archived Orders'
        : NAVIGATION.find(([href]) => href === pathname)?.[1] || 'Dashboard'

  return (
    <div className="min-h-screen bg-[#f6f1eb] text-[#3c2c24]">
      {notice && (
        <div className="fixed right-5 top-5 z-[70] max-w-sm rounded-2xl border border-[#d8c8ba] bg-[#fffdfa] px-4 py-3 text-sm font-medium shadow-xl">
          {notice}
        </div>
      )}

      {cancelOrderTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#49382d]">Cancel Order?</h2>

              <button
                onClick={() => setCancelOrderTarget(null)}
                className="text-[#8b786c] hover:text-[#49382d]"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-sm text-[#49382d]">
              Are you sure you want to cancel this order?
            </p>

            <p className="mb-6 text-sm text-[#8b786c]">
              Its history and transactions will be preserved.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCancelOrderTarget(null)}
                className="rounded-xl border border-[#d8c8ba] px-4 py-2 text-sm font-medium text-[#49382d] hover:bg-[#f6f1eb]"
              >
                Keep Order
              </button>

              <button
                onClick={() => changeOrderStatus(cancelOrderTarget, 'Cancelled', true)}
                className="rounded-xl bg-[#6f4e3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#49382d]"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {(restoreOrderTarget || restoreBulkOrderTarget) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <form
            className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-6 shadow-2xl"
            onSubmit={restoreOrder}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#49382d]">Restore Order?</h2>
              <button
                onClick={() => {
                  setRestoreOrderTarget(null)
                  setRestoreBulkOrderTarget(null)
                }}
                className="text-[#8b786c] hover:text-[#49382d]"
                type="button"
                aria-label="Close restore confirmation"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-[#8b786c]">
              Choose the active workflow status for{' '}
              {restoreOrderTarget
                ? `ORD-${restoreOrderTarget.id.slice(0, 6).toUpperCase()}`
                : `BULK-${restoreBulkOrderTarget?.id.slice(0, 6).toUpperCase()}`}
              . All related records and history will remain unchanged.
            </p>
            <Field label="Restore as">
              <select
                value={restoreStatus}
                onChange={(event) => setRestoreStatus(event.target.value)}
              >
                {ACTIVE_ORDER_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRestoreOrderTarget(null)
                  setRestoreBulkOrderTarget(null)
                }}
                className="secondary-button"
                type="button"
              >
                Keep Archived
              </button>
              <button className="primary-button" type="submit">
                Restore Order
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelBulkOrderTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#49382d]">Cancel Bulk Order?</h2>

              <button
                onClick={() => setCancelBulkOrderTarget(null)}
                className="text-[#8b786c] hover:text-[#49382d]"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-sm text-[#49382d]">
              Are you sure you want to cancel this bulk order?
            </p>

            <p className="mb-6 text-sm text-[#8b786c]">This action cannot be undone.</p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCancelBulkOrderTarget(null)}
                className="rounded-xl border border-[#d8c8ba] px-4 py-2 text-sm font-medium text-[#49382d] hover:bg-[#f6f1eb]"
              >
                Keep Order
              </button>

              <button
                onClick={() => updateBulkOrderStatus(cancelBulkOrderTarget, 'Cancelled', true)}
                className="rounded-xl bg-[#6f4e3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#49382d]"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveCustomerTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#49382d]">Archive Customer?</h2>

              <button
                onClick={() => setArchiveCustomerTarget(null)}
                className="text-[#8b786c] hover:text-[#49382d]"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-sm text-[#49382d]">
              Are you sure you want to archive {customerName(archiveCustomerTarget)}?
            </p>

            <p className="mb-6 text-sm text-[#8b786c]">
              The customer's existing history will remain available.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setArchiveCustomerTarget(null)}
                className="rounded-xl border border-[#d8c8ba] px-4 py-2 text-sm font-medium text-[#49382d] hover:bg-[#f6f1eb]"
              >
                Keep Customer
              </button>

              <button
                onClick={() => archiveCustomer(archiveCustomerTarget, true)}
                className="rounded-xl bg-[#6f4e3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#49382d]"
              >
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteMeasurementTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#49382d]">Delete Measurement Version?</h2>

              <button
                onClick={() => setDeleteMeasurementTarget(null)}
                className="text-[#8b786c] hover:text-[#49382d]"
              >
                ✕
              </button>
            </div>

            <p className="mb-2 text-sm text-[#49382d]">
              Are you sure you want to delete this measurement version?
            </p>

            <p className="mb-6 text-sm text-[#8b786c]">This action cannot be undone.</p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteMeasurementTarget(null)}
                className="rounded-xl border border-[#d8c8ba] px-4 py-2 text-sm font-medium text-[#49382d] hover:bg-[#f6f1eb]"
              >
                Keep Version
              </button>

              <button
                onClick={() => deleteMeasurement(deleteMeasurementTarget, true)}
                className="rounded-xl bg-[#6f4e3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#49382d]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col bg-[#49382d] text-[#fdf7f1] transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
            <Scissors size={21} />
          </span>
          <div>
            <p className="font-serif text-lg font-semibold">Mimi&apos;s Tailoring</p>
            <p className="text-[9px] tracking-[.18em] text-[#ccb9ab]">STUDIO ADMIN</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {NAVIGATION.map(([href, label], index) => {
            const Icon = navIcons[index]
            const active =
              href === '/customers' || href === '/orders'
                ? pathname.startsWith(href)
                : pathname === href
            return (
              <Link
                href={href}
                key={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-[#f2e7dd] font-semibold text-[#49382d]'
                    : 'text-[#eadfd7] hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate px-2 text-xs text-[#cbb9ad]">{session.user.email}</p>
          <button
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-[#eadfd7] hover:bg-white/8"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      <div className="lg:pl-[258px]">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e2d7cd] bg-[#fffdfa]/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button className="icon-button lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <p className="text-[10px] font-bold tracking-[.16em] text-[#a1846e]">
                MIMI&apos;S TAILORING
              </p>
              <h1 className="font-serif text-xl font-semibold text-[#39271f]">{pageTitle}</h1>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              className="icon-button relative"
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-label="Notifications"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#9b5546] px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button className="icon-button" onClick={loadData} aria-label="Refresh data">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-[min(380px,calc(100vw-32px))] rounded-[20px] border border-[#dfd2c5] bg-[#fffdfa] p-3 shadow-2xl">
                <div className="flex items-center justify-between px-2 pb-2">
                  <h3 className="font-serif font-semibold">Notifications</h3>
                  <button
                    className="text-xs font-semibold text-[#795946]"
                    onClick={() => markNotificationsRead()}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {data.notifications.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        markNotificationsRead(item.id)
                        setNotificationsOpen(false)
                        router.push(item.related_order_id ? '/orders' : '/customers')
                      }}
                      className={`w-full rounded-xl p-3 text-left hover:bg-[#f7f0e9] ${item.is_read ? 'opacity-60' : 'bg-[#faf4ed]'}`}
                    >
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#806f63]">{item.message}</p>
                    </button>
                  ))}
                  {!data.notifications.length && (
                    <p className="p-6 text-center text-sm text-[#8b786c]">No notifications yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-7">
          {setupError ? (
            <section className="rounded-[24px] border border-[#d8b9aa] bg-[#fff9f5] p-7">
              <p className="eyebrow">DATABASE SETUP REQUIRED</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">
                Apply the Mimi&apos;s schema
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#765f51]">
                The Supabase connection is active, but the operational tables are not available to
                this administrator yet. Run <code>supabase/migrations/001_mimis_tailoring.sql</code>{' '}
                in the Supabase SQL Editor, then create the admin profile described at the bottom of
                that file. Existing installations must also apply migrations 002, 003, and 004 in
                order.
              </p>
              <p className="mt-4 rounded-xl bg-[#f3e7dd] p-3 font-mono text-xs text-[#704c39]">
                {setupError}
              </p>
              <button className="primary-button mt-5" onClick={loadData}>
                <RefreshCw size={16} /> Check again
              </button>
            </section>
          ) : loading ? (
            <div className="grid min-h-[55vh] place-items-center">
              <div className="text-center">
                <RefreshCw className="mx-auto animate-spin text-[#82614c]" />
                <p className="mt-3 text-sm text-[#806f63]">Loading studio records…</p>
              </div>
            </div>
          ) : (
            <>
              {view === 'dashboard' && renderDashboard()}
              {view === 'customers' && renderCustomers()}
              {view === 'measurements' && renderMeasurements()}
              {view === 'orders' && renderOrders()}
              {view === 'fittings' && renderFittings()}
              {view === 'reports' && renderReports()}
              {view === 'settings' && renderSettings()}
            </>
          )}
        </main>
      </div>

      {modal === 'customer' && (
        <Modal
          title={editingCustomer ? 'Edit customer' : 'Add customer'}
          onClose={() => {
            setModal(null)
            setEditingCustomer(null)
          }}
        >
          <form className="form-grid" onSubmit={saveCustomer}>
            <Field label="First name">
              <input name="first_name" required defaultValue={editingCustomer?.first_name} />
            </Field>
            <Field label="Last name">
              <input name="last_name" required defaultValue={editingCustomer?.last_name} />
            </Field>
            <Field label="Contact number">
              <input
                name="contact_number"
                required
                defaultValue={editingCustomer?.contact_number}
              />
            </Field>
            <Field label="Address">
              <input name="address" defaultValue={editingCustomer?.address || ''} />
            </Field>
            <Field label="Customer notes" className="sm:col-span-2">
              <textarea name="notes" rows={4} defaultValue={editingCustomer?.notes || ''} />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button className="secondary-button" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="primary-button">Save customer</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'order' && (
        <Modal
          title={editingOrder ? 'Edit personal order' : 'Create personal order'}
          onClose={() => {
            setModal(null)
            setEditingOrder(null)
          }}
        >
          <OrderForm
            onSubmit={saveOrder}
            customers={activeCustomers}
            measurements={data.measurements}
            order={editingOrder}
          />
        </Modal>
      )}

      {modal === 'reorder' && selectedOrder && (
        <Modal title="Reorder from previous order" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={submitReorder}>
            <p className="sm:col-span-2 rounded-xl bg-[#f4ebe3] p-3 text-sm text-[#745b4c]">
              A new independent order will be created. Order #{selectedOrder.id.slice(0, 8)} will
              not be changed.
            </p>
            <Field label="Garment name">
              <input name="garment_name" defaultValue={selectedOrder.garment_name} required />
            </Field>
            <Field label="Garment category">
              <select
                name="garment_category"
                defaultValue={selectedOrder.garment_category || 'Tops'}
              >
                {Object.keys(GARMENTS).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Measurement version">
              <select name="measurement_id" defaultValue={selectedOrder.measurement_id || ''}>
                <option value="">No linked measurement</option>
                {data.measurements
                  .filter((item) => item.customer_id === selectedOrder.customer_id)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      Version {item.version} · {item.garment_type}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Delivery deadline">
              <input name="delivery_deadline" type="date" required />
            </Field>
            <Field label="Quantity">
              <input name="quantity" type="number" min="1" defaultValue={selectedOrder.quantity} />
            </Field>
            <Field label="Unit price">
              <input
                name="unit_price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={selectedOrder.unit_price}
              />
            </Field>
            <Field label="Sleeve style">
              <select
                name="sleeve_style"
                defaultValue={String(
                  selectedOrder.customization_details.sleeveStyle || 'Short sleeve',
                )}
              >
                {['Sleeveless', 'Short sleeve', 'Long sleeve', 'Puff sleeve'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Fit style">
              <select
                name="fit_style"
                defaultValue={String(selectedOrder.customization_details.fitStyle || 'Regular fit')}
              >
                {['Fitted', 'Regular fit', 'Loose fit', 'Oversized'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Customization notes" className="sm:col-span-2">
              <input
                name="customization_notes"
                defaultValue={String(selectedOrder.customization_details.additionalNotes || '')}
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={3} defaultValue={selectedOrder.notes || ''} />
            </Field>
            <button className="primary-button justify-center sm:col-span-2">Create reorder</button>
          </form>
        </Modal>
      )}

      {modal === 'appointment' && (
        <Modal
          title={selectedAppointment ? 'Edit fitting appointment' : 'Schedule fitting appointment'}
          onClose={() => {
            setModal(null)
            setSelectedAppointment(null)
          }}
        >
          <AppointmentForm
            onSubmit={saveAppointment}
            customers={activeCustomers}
            orders={data.orders}
            appointment={selectedAppointment}
          />
        </Modal>
      )}

      {modal === 'bulk-order' && (
        <Modal
          title={editingBulkOrder ? 'Edit bulk order' : 'Create bulk order'}
          onClose={() => {
            setModal(null)
            setEditingBulkOrder(null)
          }}
        >
          <BulkOrderForm onSubmit={saveBulkOrder} order={editingBulkOrder} />
        </Modal>
      )}

      {modal === 'bulk-item' && (
        <Modal
          title={editingBulkItem ? 'Edit bulk-order entry' : 'Add individual bulk-order entry'}
          onClose={() => {
            setModal(null)
            setEditingBulkItem(null)
          }}
        >
          <BulkItemForm
            onSubmit={saveBulkItem}
            bulkOrders={data.bulkOrders}
            customers={activeCustomers}
            measurements={data.measurements}
            item={editingBulkItem}
          />
        </Modal>
      )}

      {modal === 'order-details' && selectedOrder && renderOrderDetails()}
      {modal === 'customer-profile' && selectedCustomer && renderCustomerProfile()}
      {modal === 'payment' && selectedOrder && (
        <Modal
          title={editingPayment ? 'Correct payment record' : 'Record manual payment'}
          onClose={() => {
            setEditingPayment(null)
            setModal('order-details')
          }}
        >
          <form className="form-grid" onSubmit={savePayment}>
            <div className="sm:col-span-2 grid grid-cols-3 gap-3 rounded-xl bg-[#f5ede6] p-4 text-center text-sm">
              <div>
                <span className="block text-xs text-[#8b786c]">Order total</span>
                {money(selectedOrder.total_price)}
              </div>
              <div>
                <span className="block text-xs text-[#8b786c]">Recorded</span>
                {money(paidFor(selectedOrder.id))}
              </div>
              <div>
                <span className="block text-xs text-[#8b786c]">Balance</span>
                {money(selectedOrder.total_price - paidFor(selectedOrder.id))}
              </div>
            </div>
            <Field label="Amount">
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={editingPayment?.amount}
                required
              />
            </Field>
            <Field label="Payment date">
              <input
                name="payment_date"
                type="date"
                defaultValue={editingPayment?.payment_date || today()}
                required
              />
            </Field>
            <Field label="Payment method">
              <select name="payment_method" defaultValue={editingPayment?.payment_method || 'Cash'}>
                <option>Cash</option>
                <option>Bank transfer</option>
                <option>GCash</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Notes">
              <input name="notes" defaultValue={editingPayment?.notes || ''} />
            </Field>
            <button
              className="primary-button justify-center sm:col-span-2"
              disabled={savingPayment}
            >
              {savingPayment
                ? 'Saving…'
                : editingPayment
                  ? 'Save payment correction'
                  : 'Record payment'}
            </button>
          </form>
        </Modal>
      )}
      {modal === 'refund' && selectedOrder && (
        <Modal title="Record completed refund" onClose={() => setModal('order-details')}>
          <form className="form-grid" onSubmit={saveRefund}>
            <p className="sm:col-span-2 rounded-xl bg-[#f5ede6] p-4 text-sm text-[#745b4c]">
              Record this only after the customer has received the money. Refund records are
              permanent and cannot exceed the selected payment.
            </p>
            <Field label="Related payment" className="sm:col-span-2">
              <select name="payment_id" required defaultValue="">
                <option value="">Select payment</option>
                {data.payments
                  .filter(
                    (payment) =>
                      payment.order_id === selectedOrder.id &&
                      Number(payment.amount) - refundedFromPayment(payment.id) > 0,
                  )
                  .map((payment) => (
                    <option value={payment.id} key={payment.id}>
                      {shortDate(payment.payment_date)} · {payment.payment_method} ·{' '}
                      {money(Number(payment.amount) - refundedFromPayment(payment.id))} refundable
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Refund amount">
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </Field>
            <Field label="Refund date">
              <input name="refund_date" type="date" max={today()} defaultValue={today()} required />
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              <textarea name="reason" rows={3} required />
            </Field>
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-[#dfd2c5] p-3 text-sm text-[#5f4a3d]">
              <input className="mt-0.5 !w-auto" name="money_returned" type="checkbox" required />
              I confirm that this money has actually been returned to the customer.
            </label>
            <button className="primary-button justify-center sm:col-span-2" disabled={savingRefund}>
              {savingRefund ? 'Recording…' : 'Record refund'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )

  function renderDashboard() {
    const stats = [
      ['Total Customers', dashboard.totalCustomers, Users],
      ['Total Orders', dashboard.totalOrders, ShoppingBag],
      ['Pending', dashboard.pending, ClipboardList],
      ['In Progress', dashboard.progress, Scissors],
      ['For Fitting', dashboard.fitting, Ruler],
      ['Ready for Pickup', dashboard.ready, Check],
      ['Overdue', dashboard.overdue, CalendarDays],
    ] as const
    const upcomingOrders = data.orders
      .filter(
        (order) =>
          order.delivery_deadline && !['Completed', 'Cancelled'].includes(order.order_status),
      )
      .sort((a, b) =>
        String(a.delivery_deadline_at || a.delivery_deadline).localeCompare(
          String(b.delivery_deadline_at || b.delivery_deadline),
        ),
      )
      .slice(0, 5)
    const upcomingAppointments = data.appointments
      .filter((item) => item.appointment_date >= today() && item.status === 'Scheduled')
      .slice(0, 5)
    return (
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">BUSINESS OVERVIEW</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold">Good day, Mimi.</h2>
            <p className="mt-1 text-sm text-[#806f63]">
              Here is what needs attention in the studio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => setModal('customer')}>
              <Plus size={16} /> Add customer
            </button>
            <Link className="secondary-button" href="/measurements">
              <Ruler size={16} /> Add measurement
            </Link>
            <button className="primary-button" onClick={() => setModal('order')}>
              <ShoppingBag size={16} /> Create order
            </button>
            <button className="secondary-button" onClick={() => setModal('appointment')}>
              <CalendarDays size={16} /> Schedule fitting
            </button>
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {stats.map(([label, value, Icon]) => (
            <div key={label} className="stat-card">
              <Icon size={18} className="text-[#8a654e]" />
              <p className="mt-4 font-serif text-3xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-[#806f63]">{label}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RECENT WORK</p>
                <h3>Recent orders</h3>
              </div>
              <Link href="/orders">View all</Link>
            </div>
            <OrderRows
              orders={data.orders
                .filter((order) => !ARCHIVED_ORDER_STATUSES.includes(order.order_status))
                .slice(0, 6)}
              compact
            />
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DEADLINES</p>
                <h3>Upcoming deliveries</h3>
              </div>
            </div>
            <div className="divide-y divide-[#eee4db]">
              {upcomingOrders.map((order) => (
                <button
                  key={order.id}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  onClick={() => {
                    setSelectedOrder(order)
                    setModal('order-details')
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold">{order.garment_name}</p>
                    <p className="text-xs text-[#88766a]">
                      {customerName(findCustomer(order.customer_id))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-semibold ${isOverdue(order) ? 'text-[#a34f42]' : ''}`}
                    >
                      {orderDeadline(order)}
                    </p>
                    {isOverdue(order) && (
                      <span className="text-[10px] font-bold text-[#a34f42]">OVERDUE</span>
                    )}
                  </div>
                </button>
              ))}
              {!upcomingOrders.length && (
                <p className="py-8 text-center text-sm text-[#8b786c]">No upcoming deadlines.</p>
              )}
            </div>
          </div>
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">FITTINGS</p>
                <h3>Upcoming appointments</h3>
              </div>
            </div>
            {upcomingAppointments.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b border-[#eee4db] py-3 last:border-0"
              >
                <div className="date-tile">
                  <strong>{new Date(`${item.appointment_date}T00:00:00`).getDate()}</strong>
                  <span>
                    {new Date(`${item.appointment_date}T00:00:00`).toLocaleString('en', {
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {customerName(findCustomer(item.customer_id))}
                  </p>
                  <p className="text-xs text-[#806f63]">
                    {item.appointment_type} · {item.appointment_time.slice(0, 5)}
                  </p>
                </div>
                <StatusBadge value={item.status} />
              </div>
            ))}
            {!upcomingAppointments.length && (
              <p className="py-8 text-center text-sm text-[#8b786c]">No upcoming appointments.</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">WORKFLOW</p>
                <h3>Order status overview</h3>
              </div>
            </div>
            <div className="space-y-3 pt-2">
              {ACTIVE_ORDER_STATUSES.map((status) => {
                const count = data.orders.filter((order) => order.order_status === status).length
                const width = dashboard.totalOrders
                  ? Math.max(3, (count / dashboard.totalOrders) * 100)
                  : 0
                return (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{status}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-[#eee4db]">
                      <div
                        className="h-full rounded-full bg-[#82614c]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    )
  }

  function renderCustomers() {
    const archivedView = pathname === '/customers/archived'
    const customerRecords = archivedView
      ? data.customers.filter((customer) => Boolean(customer.archived_at))
      : activeCustomers
    const sorted = customerRecords
      .filter((customer) =>
        `${customer.first_name} ${customer.last_name} ${customer.contact_number} ${customer.address || ''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .sort((a, b) => a.last_name.localeCompare(b.last_name))
    const perPage = PAGE_SIZE
    const rows = sorted.slice((page - 1) * perPage, page * perPage)
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">CUSTOMER DIRECTORY</p>
            <h2>{archivedView ? 'Archived Customers' : 'Customers'}</h2>
            <p>
              {archivedView
                ? 'Review archived profiles and restore customers without losing their history.'
                : 'Manage profiles, measurement history, and order activity.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="secondary-button"
              href={archivedView ? '/customers' : '/customers/archived'}
            >
              {archivedView ? <Users size={16} /> : <Archive size={16} />}
              {archivedView ? 'Active customers' : 'Archived customers'}
            </Link>
            {!archivedView && (
              <button
                className="primary-button"
                onClick={() => {
                  setEditingCustomer(null)
                  setModal('customer')
                }}
              >
                <Plus size={16} /> Add customer
              </button>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search name, contact, or address…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="record-count">
              {sorted.length} {archivedView ? 'archived' : 'active'} records
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer ID</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th>Registered</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.id}>
                    <td className="font-mono text-xs">
                      CUS-{customer.id.slice(0, 6).toUpperCase()}
                    </td>
                    <td>
                      <button
                        className="text-left font-semibold hover:underline"
                        onClick={() => {
                          setSelectedCustomer(customer)
                          setModal('customer-profile')
                        }}
                      >
                        {customerName(customer)}
                      </button>
                      <p className="max-w-xs truncate text-xs text-[#8b786c]">
                        {customer.notes || 'No notes'}
                      </p>
                    </td>
                    <td>{customer.contact_number}</td>
                    <td>{customer.address || '—'}</td>
                    <td>{shortDate(customer.created_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          className="icon-button"
                          title="View"
                          onClick={() => {
                            setSelectedCustomer(customer)
                            setModal('customer-profile')
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        {archivedView ? (
                          <button
                            className="icon-button"
                            title="Restore"
                            onClick={() => restoreCustomer(customer)}
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <>
                            <button
                              className="icon-button"
                              title="Edit"
                              onClick={() => {
                                setEditingCustomer(customer)
                                setModal('customer')
                              }}
                            >
                              <Settings size={16} />
                            </button>
                            <button
                              className="icon-button"
                              title="Archive"
                              onClick={() => archiveCustomer(customer)}
                            >
                              <Archive size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <EmptyState
              title="No customers found"
              text="Add the first customer or adjust the search terms."
            />
          )}
          <Pagination page={page} total={sorted.length} perPage={perPage} onChange={setPage} />
        </div>
      </div>
    )
  }

  function renderMeasurements() {
    const relevantFields = measurementFieldsFor(
      measurementDraft.category,
      measurementDraft.garmentType,
      measurementDraft.customizations.sleeveStyle,
    )
    const customizationFields = customizationFieldsFor(
      measurementDraft.category,
      measurementDraft.garmentType,
    )
    const history = data.measurements.filter(
      (item) => !measurementDraft.customerId || item.customer_id === measurementDraft.customerId,
    )
    const historyRows = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const previewState = {
      category: measurementDraft.category,
      garmentType: measurementDraft.garmentType,
      measurements: measurementDraft.values,
      customizations: measurementDraft.customizations,
    }
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">BODY MEASUREMENT & CUSTOMIZATION</p>
            <h2>Measurement Studio</h2>
            <p>Create independent measurement versions and preserve every historical record.</p>
          </div>
          <button className="primary-button" type="button" onClick={newMeasurementVersion}>
            <Plus size={16} /> Add new measurement
          </button>
        </div>
        <form onSubmit={saveMeasurement} className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-5">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">RECORD DETAILS</p>
                  <h3>Customer and garment</h3>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Customer">
                  <select
                    value={measurementDraft.customerId}
                    onChange={(event) =>
                      setMeasurementDraft((draft) => ({ ...draft, customerId: event.target.value }))
                    }
                    required
                  >
                    <option value="">Select customer</option>
                    {activeCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customerName(customer)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Garment category">
                  <select
                    value={measurementDraft.category}
                    onChange={(event) => {
                      const category = event.target.value
                      setMeasurementDraft((draft) => ({
                        ...draft,
                        category,
                        garmentType: GARMENTS[category][0],
                        values: {},
                      }))
                      setEditingMeasurement(null)
                    }}
                  >
                    {Object.keys(GARMENTS).map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Garment type">
                  <select
                    value={measurementDraft.garmentType}
                    onChange={(event) => {
                      setMeasurementDraft((draft) => ({
                        ...draft,
                        garmentType: event.target.value,
                        values: {},
                      }))
                      setEditingMeasurement(null)
                    }}
                  >
                    {GARMENTS[measurementDraft.category].map((garment) => (
                      <option key={garment}>{garment}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Version">
                  <input
                    value={
                      editingMeasurement
                        ? `Version ${editingMeasurement.version}`
                        : `Next version: ${Math.max(0, ...data.measurements.filter((item) => item.customer_id === measurementDraft.customerId).map((item) => item.version)) + 1}`
                    }
                    readOnly
                  />
                </Field>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">INCHES</p>
                  <h3>Relevant measurements</h3>
                  <p>Only fields appropriate to the selected garment are shown.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {relevantFields.map((key) => {
                  const limit = MEASUREMENT_LIMITS[key]
                  return (
                    <Field key={key} label={`${fieldLabel(key)} (in)`}>
                      <input
                        type="number"
                        min={limit.min}
                        max={limit.max}
                        step="0.1"
                        required={limit.required}
                        value={measurementDraft.values[key] || ''}
                        onChange={(event) =>
                          setMeasurementDraft((draft) => ({
                            ...draft,
                            values: { ...draft.values, [key]: event.target.value },
                          }))
                        }
                        placeholder={`${limit.min}–${limit.max}${limit.required ? ' · Required' : ''}`}
                      />
                    </Field>
                  )
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">GARMENT DETAILS</p>
                  <h3>Customization</h3>
                </div>
              </div>
              <div className="form-grid">
                {[
                  [
                    'sleeveStyle',
                    'Sleeve style',
                    ['Sleeveless', 'Short sleeve', 'Long sleeve', 'Puff sleeve', 'Bell sleeve'],
                  ],
                  [
                    'necklineStyle',
                    'Neckline style',
                    [
                      'Round neck',
                      'V-neck',
                      'Square neck',
                      'Sweetheart neckline',
                      'Boat neck',
                      'Off-shoulder',
                    ],
                  ],
                  [
                    'backStyle',
                    'Back style',
                    ['Regular back', 'Open back', 'Backless', 'Low back', 'Keyhole back'],
                  ],
                  ['fitStyle', 'Fit style', ['Fitted', 'Regular fit', 'Loose fit', 'Oversized']],
                  [
                    'garmentSilhouette',
                    'Garment silhouette',
                    ['Straight', 'A-line', 'Ball gown', 'Mermaid', 'Wrap'],
                  ],
                ]
                  .filter(([key]) => customizationFields[key as keyof typeof customizationFields])
                  .map(([key, label, values]) => (
                    <Field key={key as string} label={label as string}>
                      <select
                        value={
                          measurementDraft.customizations[
                            key as keyof typeof measurementDraft.customizations
                          ]
                        }
                        onChange={(event) =>
                          setMeasurementDraft((draft) => ({
                            ...draft,
                            customizations: {
                              ...draft.customizations,
                              [key as string]: event.target.value,
                            },
                          }))
                        }
                      >
                        {(values as string[]).map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                <Field label="Additional customization notes" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    value={measurementDraft.customizations.additionalNotes}
                    onChange={(event) =>
                      setMeasurementDraft((draft) => ({
                        ...draft,
                        customizations: {
                          ...draft.customizations,
                          additionalNotes: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Measurement / alteration notes" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    value={measurementDraft.notes}
                    onChange={(event) =>
                      setMeasurementDraft((draft) => ({ ...draft, notes: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <button className="primary-button mt-5">
                <Check size={16} />{' '}
                {editingMeasurement
                  ? `Update Version ${editingMeasurement.version}`
                  : 'Save as new measurement version'}
              </button>
            </section>
          </div>
          <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <Mannequin state={previewState} />
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">HISTORY</p>
                  <h3>Previous versions</h3>
                </div>
              </div>
              <div className="max-h-[430px] space-y-2 overflow-y-auto">
                {historyRows.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#e7ddd4] p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Version {item.version} · {item.garment_type}
                        </p>
                        <p className="text-xs text-[#88766a]">
                          {customerName(findCustomer(item.customer_id))} ·{' '}
                          {shortDate(item.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="secondary-button !px-2.5 !py-1.5 text-xs"
                          onClick={() => viewMeasurement(item)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="secondary-button !px-2.5 !py-1.5 text-xs text-[#9a463b]"
                          onClick={() => deleteMeasurement(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[#806f63]">
                      {item.notes || 'No alteration notes.'}
                    </p>
                  </div>
                ))}
                {!history.length && (
                  <p className="py-8 text-center text-sm text-[#8b786c]">
                    No measurements saved yet.
                  </p>
                )}
                <Pagination
                  page={page}
                  total={history.length}
                  perPage={PAGE_SIZE}
                  onChange={setPage}
                />
              </div>
            </section>
          </div>
        </form>
      </div>
    )
  }

  function renderOrders() {
    const archivedView = pathname === '/orders/archived'
    const filtered = data.orders.filter((order) => {
      const term = search.toLowerCase()
      return (
        (archivedView
          ? ARCHIVED_ORDER_STATUSES.includes(order.order_status)
          : !ARCHIVED_ORDER_STATUSES.includes(order.order_status)) &&
        (order.id.toLowerCase().includes(term) ||
          order.garment_name.toLowerCase().includes(term) ||
          customerName(findCustomer(order.customer_id)).toLowerCase().includes(term)) &&
        (statusFilter === 'All' || order.order_status === statusFilter) &&
        (categoryFilter === 'All' || order.garment_category === categoryFilter) &&
        (deadlineFilter === 'All' ||
          (deadlineFilter === 'Overdue' && isOverdue(order)) ||
          (deadlineFilter === 'Next 7 days' &&
            Boolean(
              order.delivery_deadline &&
              order.delivery_deadline >= today() &&
              order.delivery_deadline <= addDays(today(), 7),
            )))
      )
    })
    const orderRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">ORDER MANAGEMENT</p>
            <h2>{archivedView ? 'Archived Orders' : 'Active Orders'}</h2>
            <p>
              {archivedView
                ? 'Review completed and cancelled orders without losing any related records.'
                : 'Track personal work, group orders, payments, and production progress.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="secondary-button" href={archivedView ? '/orders' : '/orders/archived'}>
              {archivedView ? <ShoppingBag size={16} /> : <Archive size={16} />}
              {archivedView ? 'Active orders' : 'Archived orders'}
            </Link>
            {!archivedView && orderMode === 'personal' ? (
              <button
                className="primary-button"
                onClick={() => {
                  setEditingOrder(null)
                  setModal('order')
                }}
              >
                <Plus size={16} /> Create order
              </button>
            ) : !archivedView ? (
              <>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditingBulkItem(null)
                    setModal('bulk-item')
                  }}
                >
                  <Plus size={16} /> Add individual
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setEditingBulkOrder(null)
                    setModal('bulk-order')
                  }}
                >
                  <Plus size={16} /> Create bulk order
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="inline-flex rounded-xl bg-[#eadfd5] p-1">
          <button
            className={`segment-button ${orderMode === 'personal' ? 'active' : ''}`}
            onClick={() => setOrderMode('personal')}
          >
            Personal orders
          </button>
          <button
            className={`segment-button ${orderMode === 'bulk' ? 'active' : ''}`}
            onClick={() => setOrderMode('bulk')}
          >
            Bulk / uniform orders
          </button>
        </div>
        {orderMode === 'personal' ? (
          <div className="panel">
            <div className="toolbar">
              <div className="search-box">
                <Search size={17} />
                <input
                  placeholder="Search customer or garment…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All</option>
                {(archivedView ? ARCHIVED_ORDER_STATUSES : ACTIVE_ORDER_STATUSES).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option>All</option>
                {Object.keys(GARMENTS).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              <select
                value={deadlineFilter}
                onChange={(event) => setDeadlineFilter(event.target.value)}
              >
                <option>All</option>
                <option>Overdue</option>
                <option>Next 7 days</option>
              </select>
            </div>
            <OrderRows orders={orderRows} archived={archivedView} />
            {!filtered.length && (
              <EmptyState
                title={archivedView ? 'No archived orders found' : 'No active orders found'}
                text={
                  archivedView
                    ? 'Completed and cancelled orders will appear here automatically.'
                    : 'Create an order or adjust the filters.'
                }
              />
            )}
            <Pagination
              page={page}
              total={filtered.length}
              perPage={PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        ) : (
          <BulkOrders archived={archivedView} />
        )}
      </div>
    )
  }

  function BulkOrders({ archived = false }: { archived?: boolean }) {
    const term = search.toLowerCase()
    const filteredBulkOrders = data.bulkOrders.filter(
      (bulk) =>
        (archived
          ? ARCHIVED_ORDER_STATUSES.includes(bulk.status)
          : !ARCHIVED_ORDER_STATUSES.includes(bulk.status)) &&
        `${bulk.id} ${bulk.organization_name} ${bulk.group_name || ''} ${bulk.contact_person}`
          .toLowerCase()
          .includes(term) &&
        (statusFilter === 'All' || bulk.status === statusFilter),
    )
    const bulkRows = filteredBulkOrders.slice((page - 1) * 5, page * 5)
    return (
      <div className="space-y-4">
        <div className="panel !p-3">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search organization, group, or contact…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>All</option>
              {(archived ? ARCHIVED_ORDER_STATUSES : ACTIVE_ORDER_STATUSES).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        {bulkRows.map((bulk) => {
          const items = data.bulkItems.filter((item) => item.bulk_order_id === bulk.id)
          const total = items.reduce(
            (sum, item) => sum + item.quantity * Number(item.unit_price),
            0,
          )
          const completed = items.filter((item) => item.status === 'Completed').length
          return (
            <section className="panel" key={bulk.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <p className="eyebrow">BULK-{bulk.id.slice(0, 6).toUpperCase()}</p>
                  <h3 className="font-serif text-xl font-semibold">{bulk.organization_name}</h3>
                  <p className="text-sm text-[#806f63]">
                    {bulk.group_name || 'General group'} · {bulk.contact_person} ·{' '}
                    {bulk.contact_number}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!['Completed', 'Cancelled'].includes(bulk.status) && (
                    <button
                      className="icon-button"
                      title="Edit bulk order"
                      onClick={() => {
                        setEditingBulkOrder(bulk)
                        setModal('bulk-order')
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  <select
                    className="status-select"
                    value={bulk.status}
                    disabled={['Completed', 'Cancelled'].includes(bulk.status)}
                    onChange={(event) => updateBulkOrderStatus(bulk.id, event.target.value)}
                    aria-label="Bulk order status"
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  {archived && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setRestoreStatus('Pending')
                        setRestoreBulkOrderTarget(bulk)
                      }}
                    >
                      <RotateCcw size={16} /> Restore
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-xs text-[#8b786c]">Deadline</p>
                    <p className="text-sm font-semibold">
                      {bulk.delivery_deadline_at
                        ? shortDateTime(bulk.delivery_deadline_at)
                        : shortDate(bulk.delivery_deadline)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div className="mini-stat">
                  <span>Individuals</span>
                  <strong>{items.length}</strong>
                </div>
                <div className="mini-stat">
                  <span>Total quantity</span>
                  <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Progress</span>
                  <strong>
                    {items.length ? Math.round((completed / items.length) * 100) : 0}%
                  </strong>
                </div>
                <div className="mini-stat">
                  <span>Bulk total</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              {items.length > 0 && (
                <div className="table-wrap mt-4">
                  <table>
                    <thead>
                      <tr>
                        <th>Individual</th>
                        <th>Garment</th>
                        <th>Size</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.individual_name}</td>
                          <td>{item.garment_type}</td>
                          <td>{item.size || 'Custom'}</td>
                          <td>{item.quantity}</td>
                          <td>{money(item.quantity * item.unit_price)}</td>
                          <td>
                            <select
                              className="status-select"
                              value={item.status}
                              disabled={['Completed', 'Cancelled'].includes(item.status)}
                              onChange={(event) =>
                                updateBulkItemStatus(item.id, event.target.value)
                              }
                              aria-label={`${item.individual_name} status`}
                            >
                              {ORDER_STATUSES.map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                          </td>
                          <td className="text-right">
                            {!['Completed', 'Cancelled'].includes(item.status) && (
                              <button
                                className="icon-button"
                                title="Edit entry"
                                onClick={() => {
                                  setEditingBulkItem(item)
                                  setModal('bulk-item')
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        })}
        {!filteredBulkOrders.length && (
          <EmptyState
            title={archived ? 'No archived bulk orders' : 'No active bulk orders'}
            text={
              archived
                ? 'Completed and cancelled bulk orders will appear here automatically.'
                : 'Create a school or organization order, then add each individual separately.'
            }
          />
        )}
        <div className="panel !pt-1">
          <Pagination
            page={page}
            total={filteredBulkOrders.length}
            perPage={5}
            onChange={setPage}
          />
        </div>
      </div>
    )
  }

  function OrderRows({
    orders,
    compact = false,
    archived = false,
  }: {
    orders: Order[]
    compact?: boolean
    archived?: boolean
  }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer / Garment</th>
              <th>Status</th>
              {!compact && (
                <>
                  <th>Deadline</th>
                  <th>Payment</th>
                </>
              )}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const paid = paidFor(order.id)
              const paymentStatus =
                paid <= 0 ? 'Unpaid' : paid >= order.total_price ? 'Fully Paid' : 'Partially Paid'
              return (
                <tr key={order.id} className={isOverdue(order) ? 'bg-[#fff5f2]' : ''}>
                  <td>
                    <button
                      className="font-mono text-xs font-semibold hover:underline"
                      onClick={() => {
                        setSelectedOrder(order)
                        setModal('order-details')
                      }}
                    >
                      ORD-{order.id.slice(0, 6).toUpperCase()}
                    </button>
                  </td>
                  <td>
                    <p className="font-semibold">{customerName(findCustomer(order.customer_id))}</p>
                    <p className="text-xs text-[#8b786c]">
                      {order.garment_name} · Qty {order.quantity}
                    </p>
                    {!order.measurement_id && (
                      <span className="mt-1 inline-flex rounded-full bg-[#f4e4cc] px-2 py-0.5 text-[10px] font-semibold text-[#855e2f]">
                        Measurement Needed
                      </span>
                    )}
                  </td>
                  <td>
                    {archived ? (
                      <StatusBadge value={order.order_status} />
                    ) : (
                      <select
                        className="status-select"
                        value={order.order_status}
                        disabled={ARCHIVED_ORDER_STATUSES.includes(order.order_status)}
                        onChange={(event) => changeOrderStatus(order, event.target.value)}
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  {!compact && (
                    <>
                      <td>
                        <p className={isOverdue(order) ? 'font-semibold text-[#a34f42]' : ''}>
                          {orderDeadline(order)}
                        </p>
                        {isOverdue(order) && (
                          <span className="text-[10px] font-bold text-[#a34f42]">OVERDUE</span>
                        )}
                        {isLatePickup(order) && (
                          <span className="block text-[10px] font-bold text-[#855e2f]">
                            LATE PICKUP
                          </span>
                        )}
                        {wasProducedLate(order) && (
                          <span className="block text-[10px] font-bold text-[#9a463b]">
                            PRODUCED LATE
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge value={paymentStatus} />
                        {order.order_status === 'Cancelled' && (
                          <div className="mt-1">
                            <StatusBadge value={refundStatusFor(order.id)} />
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-[#8b786c]">
                          {money(Math.max(0, order.total_price - paid))} balance
                        </p>
                      </td>
                    </>
                  )}
                  <td className="text-right">
                    <p className="font-semibold">{money(order.total_price)}</p>
                    <button
                      className="mt-1 text-xs font-semibold text-[#7b5945] hover:underline"
                      onClick={() => {
                        setSelectedOrder(order)
                        setModal('order-details')
                      }}
                    >
                      View details
                    </button>
                    {archived && (
                      <button
                        className="mt-1 block w-full text-xs font-semibold text-[#7b5945] hover:underline"
                        onClick={() => {
                          setRestoreStatus('Pending')
                          setRestoreOrderTarget(order)
                        }}
                      >
                        Restore order
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function renderFittings() {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const days = new Date(year, month + 1, 0).getDate()
    const cells = Array.from({ length: firstDay + days }, (_, index) =>
      index < firstDay ? null : index - firstDay + 1,
    )
    const activeAppointments = data.appointments.filter((item) =>
      ['Scheduled', 'Rescheduled'].includes(item.status),
    )
    const missed = data.appointments.filter(
      (item) =>
        appointmentTimestamp(item) < Date.now() &&
        ['Scheduled', 'Rescheduled'].includes(item.status),
    )
    const upcoming = activeAppointments.filter((item) => appointmentTimestamp(item) >= Date.now())
    const fittingQueue = [...missed, ...upcoming]
    const visibleFittingIds = new Set(
      fittingQueue.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item) => item.id),
    )
    const visibleMissed = missed.filter((item) => visibleFittingIds.has(item.id))
    const visibleUpcoming = upcoming.filter((item) => visibleFittingIds.has(item.id))
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">CALENDAR</p>
            <h2>Fitting Schedule</h2>
            <p>Fitting appointments remain separate from delivery deadlines.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setSelectedAppointment(null)
              setModal('appointment')
            }}
          >
            <Plus size={16} /> Schedule appointment
          </button>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
          <section className="panel">
            <div className="flex items-center justify-between">
              <button
                className="icon-button"
                onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <h3 className="font-serif text-xl font-semibold">
                {calendarMonth.toLocaleString('en', { month: 'long', year: 'numeric' })}
              </h3>
              <button
                className="icon-button"
                onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="calendar-grid mt-5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div className="calendar-label" key={day}>
                  {day}
                </div>
              ))}
              {cells.map((day, index) => {
                const date = day
                  ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  : ''
                const items = data.appointments.filter((item) => item.appointment_date === date)
                return (
                  <div className={`calendar-day ${date === today() ? 'today' : ''}`} key={index}>
                    {day && (
                      <>
                        <span className="day-number">{day}</span>
                        {items.slice(0, 3).map((item) => (
                          <div className="calendar-event" key={item.id}>
                            {item.appointment_time.slice(0, 5)}{' '}
                            {customerName(findCustomer(item.customer_id)).split(' ')[0]}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEXT UP</p>
                <h3>Upcoming appointments</h3>
              </div>
            </div>
            <div className="space-y-3">
              {visibleMissed.map((item) => {
                const order = data.orders.find((entry) => entry.id === item.order_id)
                return (
                  <div
                    className="rounded-xl border border-[#e6c7c0] bg-[#fff7f5] p-3"
                    key={item.id}
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {customerName(findCustomer(item.customer_id))}
                        </p>
                        <p className="text-xs text-[#806f63]">
                          {order?.garment_name || item.appointment_type}
                        </p>
                      </div>
                      <StatusBadge value="Overdue" />
                    </div>
                    <p className="mt-2 text-xs font-semibold">
                      Missed {shortDate(item.appointment_date)} ·{' '}
                      {item.appointment_time.slice(0, 5)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="secondary-button !px-2 !py-1 text-xs"
                        onClick={() => changeAppointment(item, 'Completed')}
                      >
                        Complete
                      </button>
                      <button
                        className="secondary-button !px-2 !py-1 text-xs"
                        onClick={() => {
                          setSelectedAppointment(item)
                          setModal('appointment')
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        className="secondary-button !px-2 !py-1 text-xs"
                        onClick={() => changeAppointment(item, 'Cancelled')}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              })}
              {visibleUpcoming.map((item) => (
                <div className="rounded-xl border border-[#e7ddd4] p-3" key={item.id}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {customerName(findCustomer(item.customer_id))}
                      </p>
                      <p className="text-xs text-[#806f63]">{item.appointment_type}</p>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                  <p className="mt-2 text-xs font-semibold">
                    {shortDate(item.appointment_date)} · {item.appointment_time.slice(0, 5)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {['Scheduled', 'Rescheduled'].includes(item.status) && (
                      <>
                        <button
                          className="secondary-button !px-2 !py-1 text-xs"
                          onClick={() => changeAppointment(item, 'Completed')}
                        >
                          Complete
                        </button>
                        <button
                          className="secondary-button !px-2 !py-1 text-xs"
                          onClick={() => {
                            setSelectedAppointment(item)
                            setModal('appointment')
                          }}
                        >
                          Reschedule
                        </button>
                        <button
                          className="secondary-button !px-2 !py-1 text-xs"
                          onClick={() => changeAppointment(item, 'Cancelled')}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!fittingQueue.length && (
                <p className="py-8 text-center text-sm text-[#8b786c]">
                  No active fitting appointments.
                </p>
              )}
              <Pagination
                page={page}
                total={fittingQueue.length}
                perPage={PAGE_SIZE}
                onChange={setPage}
              />
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderReports() {
    const garmentCounts = Object.entries(
      reportOrders.reduce<Record<string, number>>(
        (acc, order) => ({
          ...acc,
          [order.garment_name]: (acc[order.garment_name] || 0) + order.quantity,
        }),
        {},
      ),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
    const maxGarment = Math.max(1, ...garmentCounts.map(([, count]) => count))
    const reportOrderRows = reportOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">BUSINESS ANALYTICS</p>
            <h2>Reports</h2>
            <p>All figures are calculated from current Supabase records.</p>
          </div>
          <div className="flex gap-2">
            <button className="secondary-button" onClick={exportExcel}>
              <FileSpreadsheet size={16} /> Excel export
            </button>
            <button className="primary-button" onClick={exportPdf}>
              <Download size={16} /> PDF export
            </button>
          </div>
        </div>
        <div className="toolbar panel !p-3">
          <select value={reportRange} onChange={(event) => setReportRange(event.target.value)}>
            <option>This Month</option>
            <option>Today</option>
            <option>This Week</option>
            <option>This Year</option>
            <option>Custom Date Range</option>
          </select>
          {reportRange === 'Custom Date Range' && (
            <>
              <input
                className="max-w-44"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                aria-label="Report start date"
              />
              <input
                className="max-w-44"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                aria-label="Report end date"
              />
            </>
          )}
          <span className="text-xs text-[#806f63]">
            {reportRange === 'Custom Date Range' && (!customFrom || !customTo)
              ? 'Select a start and end date'
              : `Showing ${shortDate(reportBounds.from)} to ${shortDate(reportBounds.to)}`}
          </span>
        </div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total Sales', money(reportMetrics.totalSales)],
            ['Payments Received', money(reportMetrics.paymentsReceived)],
            ['Refunds Issued', money(reportMetrics.refundsIssued)],
            ['Net Payments Retained', money(netPaymentsRetained)],
            ['Outstanding Balance', money(reportMetrics.outstandingBalance)],
          ].map(([label, value]) => (
            <div className="stat-card" key={label}>
              <p className="text-xs text-[#806f63]">{label}</p>
              <p className="mt-3 font-serif text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </section>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DEMAND</p>
                <h3>Most requested garments</h3>
              </div>
            </div>
            <div className="space-y-4">
              {garmentCounts.map(([garment, count]) => (
                <div key={garment}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{garment}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="h-3 rounded-full bg-[#eee4db]">
                    <div
                      className="h-full rounded-full bg-[#795946]"
                      style={{ width: `${(count / maxGarment) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {!garmentCounts.length && (
                <p className="py-8 text-center text-sm text-[#8b786c]">No order data yet.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">ORDER REPORT</p>
                <h3>Status distribution</h3>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ORDER_STATUSES.map((status) => (
                <div className="mini-stat" key={status}>
                  <span>{status}</span>
                  <strong>
                    {reportOrders.filter((order) => order.order_status === status).length}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SALES LEDGER</p>
              <h3>Order balances</h3>
            </div>
          </div>
          <OrderRows orders={reportOrderRows} />
          <Pagination
            page={page}
            total={reportOrders.length}
            perPage={PAGE_SIZE}
            onChange={setPage}
          />
        </section>
      </div>
    )
  }

  function renderSettings() {
    return (
      <div className="space-y-5">
        <div className="page-intro">
          <div>
            <p className="eyebrow">SYSTEM PREFERENCES</p>
            <h2>Settings</h2>
            <p>Business information, administrator account, and workflow preferences.</p>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">BUSINESS</p>
                <h3>Studio information</h3>
              </div>
            </div>
            <form className="grid gap-4" onSubmit={saveSettings}>
              <Field label="Business name">
                <input
                  name="business_name"
                  defaultValue={data.settings?.business_name || "Mimi's Tailoring"}
                  required
                />
              </Field>
              <Field label="Contact number">
                <input name="contact_number" defaultValue={data.settings?.contact_number || ''} />
              </Field>
              <Field label="Business address">
                <textarea name="address" rows={3} defaultValue={data.settings?.address || ''} />
              </Field>
              <Field label="Deadline alert window">
                <select
                  name="deadline_alert_days"
                  defaultValue={data.settings?.deadline_alert_days || 3}
                >
                  <option value="1">1 day before</option>
                  <option value="3">3 days before</option>
                  <option value="7">7 days before</option>
                </select>
              </Field>
              <Field label="Measurement unit">
                <input value="Inches" readOnly />
              </Field>
              <button className="primary-button justify-center">Save preferences</button>
            </form>
          </section>
          <section className="space-y-5">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ACCOUNT</p>
                  <h3>Administrator access</h3>
                </div>
              </div>
              <div className="rounded-xl bg-[#f5ede6] p-4">
                <p className="text-xs text-[#8b786c]">Signed in as</p>
                <p className="mt-1 font-semibold">{session?.user.email}</p>
              </div>
              <button
                className="secondary-button mt-4"
                onClick={async () => {
                  const { error } = await supabase.auth.resetPasswordForEmail(
                    session?.user.email || '',
                    { redirectTo: recoveryRedirectUrl() },
                  )
                  showNotice(
                    error
                      ? error.message
                      : 'Password reset instructions have been sent to your email.',
                  )
                }}
              >
                Send password reset
              </button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderOrderDetails() {
    if (!selectedOrder) return null
    const measurement = data.measurements.find((item) => item.id === selectedOrder.measurement_id)
    const measurementValues =
      selectedOrder.measurement_snapshot?.measurement_values || measurement?.measurement_values
    const appointments = data.appointments.filter((item) => item.order_id === selectedOrder.id)
    const payments = data.payments.filter((item) => item.order_id === selectedOrder.id)
    const refunds = data.refunds.filter((item) => item.order_id === selectedOrder.id)
    const paymentRows = payments.slice((detailPage - 1) * PAGE_SIZE, detailPage * PAGE_SIZE)
    const history = data.history.filter((item) => item.order_id === selectedOrder.id)
    return (
      <Modal
        title={`Order ORD-${selectedOrder.id.slice(0, 6).toUpperCase()}`}
        onClose={() => setModal(null)}
        wide
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="detail-grid">
              <div>
                <span>Customer</span>
                <strong>{customerName(findCustomer(selectedOrder.customer_id))}</strong>
              </div>
              <div>
                <span>Garment</span>
                <strong>{selectedOrder.garment_name}</strong>
              </div>
              <div>
                <span>Status</span>
                <StatusBadge value={selectedOrder.order_status} />
              </div>
              <div>
                <span>Deadline</span>
                <strong className={isOverdue(selectedOrder) ? 'text-[#a34f42]' : ''}>
                  {orderDeadline(selectedOrder)}
                </strong>
              </div>
              <div>
                <span>Quantity</span>
                <strong>{selectedOrder.quantity}</strong>
              </div>
              <div>
                <span>Pricing</span>
                <strong>
                  {money(selectedOrder.unit_price)} × {selectedOrder.quantity}
                </strong>
              </div>
            </section>
            <section>
              <h3 className="section-title">Measurement details</h3>
              {measurementValues ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(measurementValues).map(([key, value]) => (
                    <div className="mini-stat" key={key}>
                      <span>{fieldLabel(key)}</span>
                      <strong>{value}&quot;</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-[#f4e4cc] p-3 text-sm font-semibold text-[#855e2f]">
                  Measurement Needed — this order was created without a linked measurement.
                </p>
              )}
            </section>
            <section>
              <h3 className="section-title">Fitting schedule & alteration history</h3>
              {appointments.map((item) => (
                <div
                  key={item.id}
                  className="mb-2 flex justify-between rounded-xl border border-[#e6dbd1] p-3 text-sm"
                >
                  <div>
                    <strong>{item.appointment_type}</strong>
                    <p className="text-xs text-[#8b786c]">
                      {shortDate(item.appointment_date)} · {item.appointment_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge value={item.status} />
                </div>
              ))}
              {!appointments.length && (
                <p className="text-sm text-[#8b786c]">No fittings scheduled.</p>
              )}
            </section>
            <section>
              <h3 className="section-title">Status timeline</h3>
              <div className="timeline">
                {history.map((item) => (
                  <div className="timeline-item" key={item.id}>
                    <span />
                    <div>
                      <p className="text-sm font-semibold">{item.new_status}</p>
                      <p className="text-xs text-[#8b786c]">
                        {shortDate(item.changed_at)} ·{' '}
                        {new Date(item.changed_at).toLocaleTimeString('en', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {item.notes && <p className="mt-1 text-xs">{item.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside className="space-y-4">
            <div className="rounded-[20px] bg-[#49382d] p-5 text-white">
              <p className="text-xs text-[#d9c7ba]">ORDER TOTAL</p>
              <p className="mt-1 font-serif text-3xl">{money(selectedOrder.total_price)}</p>
              <div className="mt-4 border-t border-white/15 pt-4 text-sm">
                <div className="flex justify-between">
                  <span>Recorded</span>
                  <strong>{money(paidFor(selectedOrder.id))}</strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Refunded</span>
                  <strong>{money(refundedFor(selectedOrder.id))}</strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Net retained</span>
                  <strong>
                    {money(paidFor(selectedOrder.id) - refundedFor(selectedOrder.id))}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Balance</span>
                  <strong>
                    {money(Math.max(0, selectedOrder.total_price - paidFor(selectedOrder.id)))}
                  </strong>
                </div>
                {selectedOrder.order_status === 'Cancelled' && (
                  <div className="mt-3 border-t border-white/15 pt-3">
                    <StatusBadge value={refundStatusFor(selectedOrder.id)} />
                  </div>
                )}
              </div>
              {selectedOrder.order_status !== 'Cancelled' &&
                paidFor(selectedOrder.id) < selectedOrder.total_price && (
                  <button
                    className="mt-5 w-full rounded-xl bg-[#f2e7dd] px-3 py-2.5 text-sm font-semibold text-[#49382d]"
                    onClick={() => setModal('payment')}
                  >
                    Record payment
                  </button>
                )}
            </div>
            <div className="panel !p-4">
              <h3 className="section-title !mt-0">Payment history</h3>
              {paymentRows.map((payment) => (
                <div
                  className="flex justify-between border-b border-[#eee4db] py-2 text-sm last:border-0"
                  key={payment.id}
                >
                  <div>
                    <strong>{money(payment.amount)}</strong>
                    <p className="text-xs text-[#8b786c]">{payment.payment_method}</p>
                    {refundedFromPayment(payment.id) > 0 && (
                      <p className="text-xs font-semibold text-[#9a463b]">
                        {money(refundedFromPayment(payment.id))} refunded
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="block text-xs">{shortDate(payment.payment_date)}</span>
                    {selectedOrder.order_status !== 'Cancelled' && (
                      <button
                        className="mt-1 text-[10px] font-semibold text-[#785641] hover:underline"
                        onClick={() => {
                          setEditingPayment(payment)
                          setModal('payment')
                        }}
                      >
                        Correct record
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!payments.length && <p className="text-sm text-[#8b786c]">No payments recorded.</p>}
              <Pagination
                page={detailPage}
                total={payments.length}
                perPage={PAGE_SIZE}
                onChange={setDetailPage}
              />
            </div>
            {selectedOrder.order_status === 'Cancelled' && (
              <div className="panel !p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="section-title !mt-0">Refund history</h3>
                  <StatusBadge value={refundStatusFor(selectedOrder.id)} />
                </div>
                {refunds.map((refund) => {
                  const relatedPayment = payments.find(
                    (payment) => payment.id === refund.payment_id,
                  )
                  return (
                    <div
                      className="border-b border-[#eee4db] py-2 text-sm last:border-0"
                      key={refund.id}
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{money(refund.amount)}</strong>
                        <span className="text-xs">{shortDate(refund.refund_date)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#8b786c]">{refund.reason}</p>
                      <p className="mt-1 text-[10px] text-[#8b786c]">
                        Related payment:{' '}
                        {relatedPayment
                          ? `${shortDate(relatedPayment.payment_date)} · ${money(relatedPayment.amount)}`
                          : refund.payment_id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  )
                })}
                {!refunds.length && <p className="text-sm text-[#8b786c]">No refunds recorded.</p>}
                {paidFor(selectedOrder.id) > refundedFor(selectedOrder.id) && (
                  <button
                    className="primary-button mt-4 w-full justify-center"
                    onClick={() => setModal('refund')}
                  >
                    Record refund
                  </button>
                )}
              </div>
            )}
            {!['Completed', 'Cancelled'].includes(selectedOrder.order_status) && (
              <button
                className="secondary-button w-full justify-center"
                onClick={() => {
                  setEditingOrder(selectedOrder)
                  setModal('order')
                }}
              >
                <Pencil size={16} /> Edit order
              </button>
            )}
            {!['Completed', 'Cancelled'].includes(selectedOrder.order_status) && (
              <button
                className="secondary-button w-full justify-center text-[#9a463b]"
                onClick={() => changeOrderStatus(selectedOrder, 'Cancelled')}
              >
                <Archive size={16} /> Cancel order
              </button>
            )}
            <button
              className="secondary-button w-full justify-center"
              onClick={() => reorder(selectedOrder)}
            >
              <RefreshCw size={16} /> Reorder from this order
            </button>
          </aside>
        </div>
      </Modal>
    )
  }

  function renderCustomerProfile() {
    if (!selectedCustomer) return null
    const measurements = data.measurements.filter(
      (item) => item.customer_id === selectedCustomer.id,
    )
    const orders = data.orders.filter((item) => item.customer_id === selectedCustomer.id)
    const appointments = data.appointments.filter(
      (item) => item.customer_id === selectedCustomer.id,
    )
    return (
      <Modal title={customerName(selectedCustomer)} onClose={() => setModal(null)} wide>
        <div className="space-y-6">
          <section className="detail-grid">
            <div>
              <span>Customer ID</span>
              <strong>CUS-{selectedCustomer.id.slice(0, 6).toUpperCase()}</strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>{selectedCustomer.contact_number}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{selectedCustomer.address || '—'}</strong>
            </div>
            <div>
              <span>Registered</span>
              <strong>{shortDate(selectedCustomer.created_at)}</strong>
            </div>
            <div className="sm:col-span-2">
              <span>Notes</span>
              <strong>{selectedCustomer.notes || 'No customer notes.'}</strong>
            </div>
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <h3 className="section-title">Measurement history</h3>
              {measurements.map((item) => (
                <div className="mb-2 rounded-xl border border-[#e6dbd1] p-3" key={item.id}>
                  <div className="flex justify-between">
                    <strong>
                      Version {item.version} · {item.garment_type}
                    </strong>
                    <span className="text-xs">{shortDate(item.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8b786c]">{item.notes || 'No notes'}</p>
                  <button
                    className="mt-2 text-xs font-semibold text-[#785641]"
                    onClick={() => {
                      viewMeasurement(item)
                      setModal(null)
                      router.push('/measurements')
                    }}
                  >
                    View measurement
                  </button>
                </div>
              ))}
              {!measurements.length && (
                <p className="text-sm text-[#8b786c]">No measurements yet.</p>
              )}
            </section>
            <section>
              <h3 className="section-title">Order history</h3>
              {orders.map((order) => (
                <button
                  className="mb-2 flex w-full justify-between rounded-xl border border-[#e6dbd1] p-3 text-left"
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order)
                    setModal('order-details')
                  }}
                >
                  <div>
                    <strong className="text-sm">{order.garment_name}</strong>
                    <p className="text-xs text-[#8b786c]">{shortDate(order.order_date)}</p>
                  </div>
                  <StatusBadge value={order.order_status} />
                </button>
              ))}
              {!orders.length && <p className="text-sm text-[#8b786c]">No orders yet.</p>}
            </section>
          </div>
          <section>
            <h3 className="section-title">Activity history</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="mini-stat">
                <span>Orders</span>
                <strong>{orders.length}</strong>
              </div>
              <div className="mini-stat">
                <span>Measurement updates</span>
                <strong>{measurements.length}</strong>
              </div>
              <div className="mini-stat">
                <span>Fittings</span>
                <strong>{appointments.length}</strong>
              </div>
            </div>
          </section>
        </div>
      </Modal>
    )
  }
}

function OrderForm({
  onSubmit,
  customers,
  measurements,
  order,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  customers: Customer[]
  measurements: Measurement[]
  order?: Order | null
}) {
  const [customerId, setCustomerId] = useState(order?.customer_id || '')
  const [measurementId, setMeasurementId] = useState(order?.measurement_id || '')
  const selectedMeasurement = measurements.find((item) => item.id === measurementId)
  const [deadlineAt, setDeadlineAt] = useState(
    localDateTime(order?.delivery_deadline_at) ||
      (order?.delivery_deadline ? `${order.delivery_deadline}T17:00` : ''),
  )
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Customer">
        <select
          name="customer_id"
          required
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value)
            setMeasurementId('')
          }}
        >
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customerName(customer)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked measurement">
        <select
          name="measurement_id"
          value={measurementId}
          onChange={(event) => setMeasurementId(event.target.value)}
        >
          <option value="">No linked measurement</option>
          {measurements
            .filter((item) => item.customer_id === customerId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                Version {item.version} · {item.garment_type}
              </option>
            ))}
        </select>
      </Field>
      {selectedMeasurement ? (
        <div className="sm:col-span-2 rounded-xl border border-[#e7ddd4] bg-[#fcf8f3] p-4">
          <p className="text-sm font-semibold">
            Version {selectedMeasurement.version} · {selectedMeasurement.garment_type}
          </p>
          <p className="mt-1 text-xs text-[#806f63]">
            {selectedMeasurement.garment_category} · Garment and customization details are fixed
            from this measurement.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(selectedMeasurement.measurement_values).map(([key, value]) => (
              <div className="mini-stat" key={key}>
                <span>{fieldLabel(key)}</span>
                <strong>{value}&quot;</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Field label="Garment name">
            <input name="garment_name" defaultValue={order?.garment_name} required />
          </Field>
          <Field label="Category">
            <select name="garment_category" defaultValue={order?.garment_category || 'Tops'}>
              {Object.keys(GARMENTS).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="Quantity">
        <input name="quantity" type="number" min="1" defaultValue={order?.quantity || 1} required />
      </Field>
      <Field label="Unit price">
        <input
          name="unit_price"
          type="number"
          min="0"
          step="0.01"
          defaultValue={order?.unit_price}
          required
        />
      </Field>
      <Field label="Order date">
        <input name="order_date" type="date" defaultValue={order?.order_date || today()} required />
      </Field>
      <Field label="Delivery deadline date and time">
        <input
          name="delivery_deadline_at"
          type="datetime-local"
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
          required
        />
        <input name="delivery_deadline" type="hidden" value={deadlineAt.slice(0, 10)} readOnly />
      </Field>
      {!selectedMeasurement && (
        <>
          <Field label="Sleeve style">
            <select
              name="sleeve_style"
              defaultValue={String(order?.customization_details.sleeveStyle || 'Short sleeve')}
            >
              {['Sleeveless', 'Short sleeve', 'Long sleeve', 'Puff sleeve'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Neckline style">
            <select
              name="neckline_style"
              defaultValue={String(order?.customization_details.necklineStyle || 'Round neck')}
            >
              {['Round neck', 'V-neck', 'Square neck', 'Sweetheart neckline', 'Off-shoulder'].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Fit style">
            <select
              name="fit_style"
              defaultValue={String(order?.customization_details.fitStyle || 'Regular fit')}
            >
              {['Fitted', 'Regular fit', 'Loose fit', 'Oversized'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Customization notes">
            <input
              name="customization_notes"
              defaultValue={String(order?.customization_details.additionalNotes || '')}
            />
          </Field>
        </>
      )}
      <Field label="Order notes" className="sm:col-span-2">
        <textarea name="notes" rows={3} defaultValue={order?.notes || ''} />
      </Field>
      <button className="primary-button justify-center sm:col-span-2">
        {order ? 'Save order changes' : 'Create order'}
      </button>
    </form>
  )
}

function AppointmentForm({
  onSubmit,
  customers,
  orders,
  appointment,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  customers: Customer[]
  orders: Order[]
  appointment?: Appointment | null
}) {
  const [customerId, setCustomerId] = useState(appointment?.customer_id || '')
  const [orderId, setOrderId] = useState(appointment?.order_id || '')
  const currentCustomerMissing =
    appointment && !customers.some((customer) => customer.id === appointment.customer_id)
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Customer">
        <select
          name="customer_id"
          required
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value)
            setOrderId('')
          }}
        >
          <option value="">Select customer</option>
          {currentCustomerMissing && (
            <option value={appointment.customer_id}>
              {customerName(undefined)} (archived customer)
            </option>
          )}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customerName(customer)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked order">
        <select
          name="order_id"
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
        >
          <option value="">No linked order</option>
          {orders
            .filter(
              (order) =>
                order.customer_id === customerId &&
                (!['Completed', 'Cancelled'].includes(order.order_status) ||
                  order.id === appointment?.order_id),
            )
            .map((order) => (
              <option value={order.id} key={order.id}>
                {order.garment_name} · {order.id.slice(0, 6)}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Appointment type">
        <select name="appointment_type" defaultValue={appointment?.appointment_type}>
          {[
            'Initial Fitting',
            'Follow-up Fitting',
            'Alteration Fitting',
            'Final Fitting',
            'Pickup',
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          name="appointment_date"
          type="date"
          min={today()}
          defaultValue={appointment?.appointment_date}
          required
        />
      </Field>
      <Field label="Time">
        <input
          name="appointment_time"
          type="time"
          defaultValue={appointment?.appointment_time.slice(0, 5)}
          required
        />
      </Field>
      <Field label="Notes">
        <input name="notes" defaultValue={appointment?.notes || ''} />
      </Field>
      <button className="primary-button justify-center sm:col-span-2">
        {appointment ? 'Save appointment changes' : 'Schedule appointment'}
      </button>
    </form>
  )
}

function BulkOrderForm({
  onSubmit,
  order,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  order?: BulkOrder | null
}) {
  const [deadlineAt, setDeadlineAt] = useState(
    localDateTime(order?.delivery_deadline_at) ||
      (order?.delivery_deadline ? `${order.delivery_deadline}T17:00` : ''),
  )
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="School or organization">
        <input name="organization_name" defaultValue={order?.organization_name} required />
      </Field>
      <Field label="Group name">
        <input name="group_name" defaultValue={order?.group_name || ''} />
      </Field>
      <Field label="Contact person">
        <input name="contact_person" defaultValue={order?.contact_person} required />
      </Field>
      <Field label="Contact number">
        <input name="contact_number" defaultValue={order?.contact_number} required />
      </Field>
      <Field label="Order date">
        <input name="order_date" type="date" defaultValue={order?.order_date || today()} required />
      </Field>
      <Field label="Delivery deadline date and time">
        <input
          name="delivery_deadline_at"
          type="datetime-local"
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
          required
        />
        <input name="delivery_deadline" type="hidden" value={deadlineAt.slice(0, 10)} readOnly />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <textarea name="notes" rows={3} defaultValue={order?.notes || ''} />
      </Field>
      <button className="primary-button justify-center sm:col-span-2">
        {order ? 'Save bulk order changes' : 'Create bulk order'}
      </button>
    </form>
  )
}

function BulkItemForm({
  onSubmit,
  bulkOrders,
  customers,
  measurements,
  item,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  bulkOrders: BulkOrder[]
  customers: Customer[]
  measurements: Measurement[]
  item?: BulkItem | null
}) {
  const [customerId, setCustomerId] = useState(item?.customer_id || '')
  const [measurementId, setMeasurementId] = useState(item?.measurement_id || '')
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <Field label="Bulk order">
        <select name="bulk_order_id" required defaultValue={item?.bulk_order_id || ''}>
          <option value="">Select bulk order</option>
          {bulkOrders.map((bulk) => (
            <option value={bulk.id} key={bulk.id}>
              {bulk.organization_name} · {bulk.group_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked customer (optional)">
        <select
          name="customer_id"
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value)
            setMeasurementId('')
          }}
        >
          <option value="">No existing customer record</option>
          {customers.map((customer) => (
            <option value={customer.id} key={customer.id}>
              {customerName(customer)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Linked measurement (optional)">
        <select
          name="measurement_id"
          disabled={!customerId}
          value={measurementId}
          onChange={(event) => setMeasurementId(event.target.value)}
        >
          <option value="">No linked measurement</option>
          {measurements
            .filter((measurement) => measurement.customer_id === customerId)
            .map((measurement) => (
              <option value={measurement.id} key={measurement.id}>
                Version {measurement.version} · {measurement.garment_type}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Student / individual name">
        <input name="individual_name" defaultValue={item?.individual_name} required />
      </Field>
      <Field label="Garment type">
        <input name="garment_type" defaultValue={item?.garment_type} required={!measurementId} />
      </Field>
      <Field label="Size">
        <input name="size" defaultValue={item?.size || ''} placeholder="Custom or standard size" />
      </Field>
      <Field label="Quantity">
        <input name="quantity" type="number" min="1" defaultValue={item?.quantity || 1} required />
      </Field>
      <Field label="Individual unit price">
        <input
          name="unit_price"
          type="number"
          min="0"
          step="0.01"
          defaultValue={item?.unit_price}
          required
        />
      </Field>
      <Field label="Notes">
        <input name="notes" defaultValue={item?.notes || ''} />
      </Field>
      <button className="primary-button justify-center sm:col-span-2">
        {item ? 'Save entry changes' : 'Add individual entry'}
      </button>
    </form>
  )
}

function Pagination({
  page,
  total,
  perPage,
  onChange,
}: {
  page: number
  total: number
  perPage: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (total <= perPage) return null
  return (
    <div className="mt-4 flex items-center justify-between border-t border-[#eee4db] pt-4 text-xs text-[#806f63]">
      <span>
        Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button className="icon-button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span className="grid min-w-16 place-items-center">
          Page {page}/{pages}
        </span>
        <button className="icon-button" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const logoutButton = document.querySelector("#logoutButton");
const appShell = document.querySelector("#appShell");
const sidebarToggle = document.querySelector("#sidebarToggle");
const cashPositionCard = document.querySelector("#cashPositionCard");
const dailySpendingCard = document.querySelector("#dailySpendingCard");
const obligationsList = document.querySelector("#obligationsList");
const setupBadge = document.querySelector(".setup-badge");
const groceryModal = document.querySelector("#groceryModal");
const groceryForm = document.querySelector("#groceryForm");

const VALID_USERNAME = "viraone";
const VALID_PASSWORD = "123456";

const AUTH_SESSION_KEY = "isLoggedIn";
const DEFAULT_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

if (appShell && sidebarToggle) {
  sidebarToggle.addEventListener("click", () => {
    const isCollapsed = appShell.classList.toggle("sidebar-collapsed");
    sidebarToggle.setAttribute("aria-pressed", String(isCollapsed));
  });
}

let startingCash = null;
let obligations = [];
let editingObligationId = null;
let dashboardInitialized = false;
let supabaseClient = null;
const ledgerMode = "Supabase sync";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * @typedef {Object} Obligation
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {number | null} amount
 * @property {string | undefined} amountLabel
 * @property {string | null} dueDate
 * @property {"monthly" | undefined} cadence
 * @property {boolean} isPaid
 * @property {string | null | undefined} paidDate
 * @property {string | undefined} icon
 */

/**
 * @typedef {Object} CashPositionProps
 * @property {number} availableCash
 * @property {number} trackedObligations
 * @property {number} knownAmounts
 * @property {number} unknownAmounts
 * @property {number} paidCount
 * @property {number} totalPaidBills
 * @property {number} billsRemaining
 * @property {number} groceriesSpent
 * @property {number} adjustedCash
 * @property {number | null} projectedRemaining
 */

/**
 * @typedef {Object} GroceryTransaction
 * @property {string} id
 * @property {string} merchant
 * @property {number} amount
 * @property {string} date
 */

/** @type {GroceryTransaction[]} */
let groceryTransactions = [];

const iconSvgs = {
  home: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </svg>
  `,
  loan: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  `,
  card: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  `,
  internet: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12a10 10 0 0 1 14 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M12 19h.01" />
    </svg>
  `,
  mobile: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17h2" />
    </svg>
  `,
  utility: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13 2-7 12h6l-1 8 7-12h-6l1-8Z" />
    </svg>
  `,
  insurance: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  `,
};

const obligationIconMap = {
  "pilot-apartments": "home",
  "becu-personal-loan": "loan",
  "paypal-credit-card": "card",
  "xfinity-internet": "internet",
  "xfinity-mobile": "mobile",
  "becu-credit-card": "card",
  "seattle-city-lights": "utility",
  "progressive-insurance": "insurance",
};

const obligationAmountLabelMap = {
  "paypal-credit-card": "Balance owed",
};

const formatCurrency = (value) => currencyFormatter.format(value);

const requireStartingCash = () => {
  if (typeof startingCash !== "number") {
    throw new Error("Starting cash has not loaded from Supabase yet");
  }

  return startingCash;
};

const formatAmountInput = (value) =>
  value == null ? "" : formatCurrency(value).replace("$", "");

function getSupabaseConfig() {
  const config = window.GRAVY_SUPABASE_CONFIG ?? {};
  const url = config.url?.trim();
  const anonKey = config.anonKey?.trim();
  const profileId = config.profileId?.trim() || DEFAULT_PROFILE_ID;

  if (
    !url ||
    !anonKey ||
    url.includes("YOUR_SUPABASE_PROJECT_URL") ||
    anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  ) {
    throw new Error(
      "Supabase is not configured. Add your project URL and anon key in supabase-config.js.",
    );
  }

  return { url, anonKey, profileId };
}

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!window.supabase?.createClient) {
    throw new Error("Supabase JavaScript client did not load.");
  }

  const { url, anonKey } = getSupabaseConfig();
  supabaseClient = window.supabase.createClient(url, anonKey);
  return supabaseClient;
}

function throwIfSupabaseError(error, action) {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

function fromSupabaseObligation(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: row.amount,
    dueDate: row.due_date,
    cadence: "monthly",
    isPaid: row.is_paid,
    paidDate: row.paid_date,
    amountLabel: row.amount_label,
  };
}

function toSupabaseObligationPatch(obligation) {
  return {
    amount: obligation.amount,
    due_date: obligation.dueDate,
    is_paid: obligation.isPaid,
    paid_date: obligation.paidDate ?? null,
    amount_label: obligation.amountLabel ?? null,
  };
}

function fromSupabaseGrocery(row) {
  return {
    id: row.id,
    merchant: row.merchant,
    amount: row.amount,
    date: row.date,
  };
}

function toSupabaseGrocery(transaction) {
  return {
    id: transaction.id,
    merchant: transaction.merchant,
    amount: transaction.amount,
    date: transaction.date,
  };
}

function normalizeObligations(nextObligations) {
  if (!Array.isArray(nextObligations)) {
    throw new Error("Supabase obligations query must return an array");
  }

  return nextObligations.map((obligation) => ({
    id: obligation.id,
    name: obligation.name,
    category: obligation.category,
    amount:
      obligation.amount == null ? null : Number(obligation.amount),
    dueDate: obligation.dueDate ?? null,
    cadence: obligation.cadence ?? "monthly",
    isPaid: Boolean(obligation.isPaid),
    paidDate: obligation.paidDate ?? null,
    amountLabel: obligation.amountLabel ?? obligationAmountLabelMap[obligation.id],
    icon:
      obligation.icon ??
      obligationIconMap[obligation.id] ??
      obligation.category?.toLowerCase().replace(/\s+/g, "-") ??
      "card",
  }));
}

async function loadDashboardDataFromSupabase() {
  const client = getSupabaseClient();
  const { profileId } = getSupabaseConfig();

  const [cashResult, obligationsResult, groceriesResult] = await Promise.all([
    client
      .from("cash_position")
      .select("id, available_cash, updated_at")
      .eq("id", profileId)
      .limit(1),
    client
      .from("obligations")
      .select("id, name, category, amount, due_date, is_paid, paid_date, amount_label")
      .order("due_date", { ascending: true })
      .order("name", { ascending: true }),
    client
      .from("grocery_transactions")
      .select("id, merchant, amount, date")
      .order("date", { ascending: false }),
  ]);

  throwIfSupabaseError(cashResult.error, "Unable to load cash position");
  throwIfSupabaseError(obligationsResult.error, "Unable to load obligations");
  throwIfSupabaseError(groceriesResult.error, "Unable to load grocery transactions");

  const cashRow = cashResult.data?.[0];

  if (!cashRow) {
    throw new Error(
      "No cash_position row found for this profile. Run supabase/schema.sql first.",
    );
  }

  const nextStartingCash = Number(cashRow.available_cash);

  if (!Number.isFinite(nextStartingCash)) {
    throw new Error("Starting cash is not a valid number");
  }

  return {
    startingCash: nextStartingCash,
    groceries: normalizeGroceries(
      (groceriesResult.data ?? []).map(fromSupabaseGrocery),
    ),
    obligations: normalizeObligations(
      (obligationsResult.data ?? []).map(fromSupabaseObligation),
    ),
  };
}

async function saveCashPosition(nextStartingCash) {
  const client = getSupabaseClient();
  const { profileId } = getSupabaseConfig();
  const { error } = await client
    .from("cash_position")
    .update({
      available_cash: nextStartingCash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  throwIfSupabaseError(error, "Unable to save cash position");
}

async function createGroceryTransaction(transaction) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("grocery_transactions")
    .insert(toSupabaseGrocery(transaction))
    .select("id, merchant, amount, date")
    .single();

  throwIfSupabaseError(error, "Unable to save grocery purchase");
  return normalizeGroceries([fromSupabaseGrocery(data)])[0];
}

async function saveObligation(obligation) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("obligations")
    .update(toSupabaseObligationPatch(obligation))
    .eq("id", obligation.id)
    .select("id, name, category, amount, due_date, is_paid, paid_date, amount_label")
    .single();

  throwIfSupabaseError(error, "Unable to save obligation");
  return normalizeObligations([fromSupabaseObligation(data)])[0];
}

const parseAmount = (value) => {
  const normalized = value.replace(/[$,\s]/g, "");

  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDueDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `Due ${dueDateFormatter.format(date)}`;
};

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const isCurrentMonth = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date();

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  );
};

function normalizeGroceries(nextGroceries) {
  if (!Array.isArray(nextGroceries)) {
    return [];
  }

  return nextGroceries
    .map((transaction) => ({
      id:
        transaction.id ??
        `grocery-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      merchant: String(transaction.merchant ?? "").trim(),
      amount: Number(transaction.amount),
      date: transaction.date,
    }))
    .filter(
      (transaction) =>
        transaction.merchant &&
        Number.isFinite(transaction.amount) &&
        transaction.amount > 0 &&
        !Number.isNaN(new Date(`${transaction.date}T00:00:00`).getTime()),
    );
}

const calculateTotalPaidBills = (nextObligations = obligations) =>
  nextObligations.reduce(
    (sum, obligation) =>
      obligation.isPaid ? sum + (obligation.amount ?? 0) : sum,
    0,
  );

const calculateMonthToDateGrocerySpending = (
  nextGroceries = groceryTransactions,
) =>
  nextGroceries.reduce(
    (total, transaction) =>
      isCurrentMonth(transaction.date) ? total + transaction.amount : total,
    0,
  );

const calculateBillTotals = () => {
  const paidObligations = obligations.filter(
    (obligation) => obligation.isPaid && obligation.amount != null,
  );
  const knownAmounts = obligations.reduce(
    (total, obligation) => total + (obligation.amount ?? 0),
    0,
  );
  const unknownAmounts = obligations.filter(
    (obligation) => obligation.amount == null,
  ).length;
  const totalPaidBills = paidObligations.reduce(
    (sum, obligation) => sum + (obligation.amount ?? 0),
    0,
  );
  const billsRemaining = obligations.reduce(
    (sum, obligation) =>
      obligation.isPaid ? sum : sum + (obligation.amount ?? 0),
    0,
  );

  return {
    paidObligations,
    paidCount: obligations.filter((obligation) => obligation.isPaid).length,
    totalPaidBills,
    billsRemaining,
    knownAmounts,
    unknownAmounts,
  };
};

const calculateGrocerySpending = () => {
  const currentStartingCash = requireStartingCash();
  const today = getTodayString();
  const todaysSpending = groceryTransactions.reduce(
    (total, transaction) =>
      transaction.date === today ? total + transaction.amount : total,
    0,
  );
  const monthToDateSpending = calculateMonthToDateGrocerySpending();
  const { totalPaidBills } = calculateBillTotals();

  return {
    todaysSpending,
    monthToDateSpending,
    adjustedCash: currentStartingCash - monthToDateSpending - totalPaidBills,
  };
};

const getObligationById = (id) =>
  obligations.find((obligation) => obligation.id === id);

const calculateCashPosition = () => {
  const billTotals = calculateBillTotals();
  const { monthToDateSpending, adjustedCash } = calculateGrocerySpending();

  return {
    availableCash: adjustedCash,
    trackedObligations: obligations.length,
    groceriesSpent: monthToDateSpending,
    adjustedCash,
    projectedRemaining: adjustedCash,
    ...billTotals,
  };
};

/** @param {CashPositionProps} props */
function CashPositionCard({
  availableCash: currentCash,
  trackedObligations,
  paidCount,
  groceriesSpent,
  adjustedCash,
}) {
  const progressPercent =
    trackedObligations === 0 ? 0 : (paidCount / trackedObligations) * 100;

  return `
    <article class="cash-position-card" aria-label="Cash Position">
      <div class="cash-card-top">
        <h3>Cash Position</h3>
        <span class="ai-chip">${ledgerMode}</span>
      </div>

      <dl class="cash-summary">
        <div class="cash-hero">
          <dt>Available cash</dt>
          <dd>${formatCurrency(currentCash)}</dd>
        </div>
        <div class="monthly-progress">
          <dt>Monthly bills</dt>
          <dd>
            <span>${paidCount} / ${trackedObligations} paid</span>
            <i aria-hidden="true">
              <b style="width: ${progressPercent}%"></b>
            </i>
          </dd>
        </div>
        <div class="cash-row">
          <dt>Grocery spending</dt>
          <dd class="cash-value">${formatCurrency(groceriesSpent)}</dd>
        </div>
        <div class="cash-row adjusted-cash-summary">
          <dt>Adjusted cash</dt>
          <dd class="cash-value">${formatCurrency(adjustedCash)}</dd>
        </div>
      </dl>
    </article>
  `;
}

const PlusIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
`;

function formatTransactionDate(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Date TBD";
  }

  return dueDateFormatter.format(date);
}

function GroceryTransactionList() {
  if (groceryTransactions.length === 0) {
    return `
      <p class="spending-empty">
        No grocery purchases logged yet. Add one to update cash projections.
      </p>
    `;
  }

  return `
    <div class="transaction-list" aria-label="Groceries transactions">
      ${groceryTransactions
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          (transaction) => `
            <div class="transaction-row">
              <div>
                <strong>${escapeHtml(transaction.merchant)}</strong>
                <span>${escapeHtml(formatTransactionDate(transaction.date))}</span>
              </div>
              <b>${formatCurrency(transaction.amount)}</b>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function DailySpendingCard() {
  const { todaysSpending, monthToDateSpending, adjustedCash } =
    calculateGrocerySpending();

  return `
    <article class="daily-spending-card" aria-label="Daily Spending">
      <div class="daily-card-top">
        <div>
          <h3>Daily Spending</h3>
          <p>Variable spend plus paid bills updates real cash left.</p>
        </div>
        <button class="add-spending-button" type="button" data-action="open-grocery-modal">
          ${PlusIcon}
          <span>+ Add grocery purchase</span>
        </button>
      </div>

      <div class="spending-category">
        <span class="spending-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M6 9h12l-1.2 10H7.2L6 9Z" />
            <path d="M8 9a4 4 0 0 1 8 0" />
            <path d="M10 13h4" />
          </svg>
        </span>
        <div>
          <h4>Groceries</h4>
          <p>Food and household essentials</p>
        </div>
      </div>

      <dl class="spending-summary">
        <div>
          <dt>Today's spending</dt>
          <dd>${formatCurrency(todaysSpending)}</dd>
        </div>
        <div>
          <dt>Month-to-date spending</dt>
          <dd>${formatCurrency(monthToDateSpending)}</dd>
        </div>
        <div class="adjusted-cash-row">
          <dt>Adjusted cash</dt>
          <dd>${formatCurrency(adjustedCash)}</dd>
        </div>
      </dl>

      ${GroceryTransactionList()}
    </article>
  `;
}

const EditIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
`;

/** @param {Obligation} obligation */
function ObligationCard(obligation) {
  if (editingObligationId === obligation.id) {
    return EditableObligationCard(obligation);
  }

  const icon = obligation.icon ?? "card";
  const amountIsKnown = obligation.amount != null;
  const amountLabel = obligation.isPaid
    ? `&#10003; Paid ${formatTransactionDate(obligation.paidDate)}`
    : amountIsKnown
      ? obligation.amountLabel ?? "Due monthly"
      : "Due monthly";
  const amountValue = amountIsKnown
    ? formatCurrency(obligation.amount)
    : "Amount TBD";
  const dueDate = formatDueDate(obligation.dueDate);
  const editLabel = amountIsKnown ? "Edit" : "Add amount";

  return `
    <article class="bill-row ${amountIsKnown ? "" : "needs-amount"} ${
      obligation.isPaid ? "paid-bill" : ""
    }" data-obligation-id="${escapeHtml(obligation.id)}">
      <span class="bill-icon ${escapeHtml(icon)}" aria-hidden="true">
        ${iconSvgs[icon] ?? iconSvgs.card}
      </span>
      <div class="bill-main">
        <h3>${escapeHtml(obligation.name)}</h3>
        <p>${escapeHtml(obligation.category)}</p>
      </div>
      <div class="bill-meta">
        <span class="${obligation.isPaid ? "paid-status" : ""}">${amountLabel}</span>
        <strong class="${amountIsKnown ? "" : "tbd-amount"}">${escapeHtml(amountValue)}</strong>
        ${
          dueDate && !obligation.isPaid
            ? `<span class="bill-due-date">${escapeHtml(dueDate)}</span>`
            : ""
        }
      </div>
      <div class="bill-actions">
        ${
          obligation.isPaid
            ? `
              <button
                class="undo-payment-button"
                type="button"
                data-action="undo-payment"
                data-id="${escapeHtml(obligation.id)}"
              >
                Undo Payment
              </button>
            `
            : `
              <button
                class="mark-paid-button"
                type="button"
                data-action="mark-paid"
                data-id="${escapeHtml(obligation.id)}"
              >
                Mark Paid
              </button>
              <button
                class="edit-bill-button"
                type="button"
                data-action="edit"
                data-id="${escapeHtml(obligation.id)}"
                aria-label="Edit ${escapeHtml(obligation.name)}"
                title="Edit"
              >
                ${EditIcon}
                <span class="edit-button-label">${editLabel}</span>
              </button>
            `
        }
      </div>
    </article>
  `;
}

/** @param {Obligation} obligation */
function EditableObligationCard(obligation) {
  const icon = obligation.icon ?? "card";

  return `
    <article class="bill-row bill-row-editing" data-obligation-id="${escapeHtml(
      obligation.id,
    )}">
      <span class="bill-icon ${escapeHtml(icon)}" aria-hidden="true">
        ${iconSvgs[icon] ?? iconSvgs.card}
      </span>
      <form class="bill-edit-form" data-id="${escapeHtml(obligation.id)}" novalidate>
        <div class="edit-form-header">
          <div>
            <h3>${escapeHtml(obligation.name)}</h3>
            <p>${escapeHtml(obligation.category)}</p>
          </div>
          <span>Monthly</span>
        </div>

        <div class="edit-fields">
          <label class="field-group">
            <span>Amount</span>
            <div class="currency-input">
              <span aria-hidden="true">$</span>
              <input
                type="text"
                name="amount"
                inputmode="decimal"
                autocomplete="off"
                placeholder="Amount TBD"
                value="${escapeHtml(formatAmountInput(obligation.amount))}"
              />
            </div>
          </label>

          <label class="field-group">
            <span>Due date</span>
            <input type="date" name="dueDate" value="${escapeHtml(obligation.dueDate ?? "")}" />
          </label>
        </div>

        <p class="form-error" role="alert"></p>

        <div class="edit-actions">
          <button class="clear-button" type="button" data-action="clear-amount">
            Clear amount
          </button>
          <button class="secondary-button" type="button" data-action="cancel">
            Cancel
          </button>
          <button class="primary-button" type="submit">Save</button>
        </div>
      </form>
    </article>
  `;
}

function renderCashPosition() {
  if (!cashPositionCard) {
    return;
  }

  cashPositionCard.innerHTML = CashPositionCard(calculateCashPosition());
}

function renderDailySpending() {
  if (!dailySpendingCard) {
    return;
  }

  dailySpendingCard.innerHTML = DailySpendingCard();
}

function renderObligations() {
  if (!obligationsList) {
    return;
  }

  obligationsList.innerHTML = obligations.map(ObligationCard).join("");
}

function renderDashboard() {
  renderCashPosition();
  renderDailySpending();
  renderObligations();

  if (setupBadge) {
    setupBadge.textContent = `${obligations.length} tracked`;
  }
}

function showFormError(form, message) {
  const error = form.querySelector(".form-error");

  if (error) {
    error.textContent = message;
  }
}

function isLoggedIn() {
  return localStorage.getItem(AUTH_SESSION_KEY) === "true";
}

function showLoginScreen() {
  if (loginScreen) {
    loginScreen.hidden = false;
  }

  if (appShell) {
    appShell.hidden = true;
  }

  loginForm?.reset();

  if (loginForm) {
    showFormError(loginForm, "");
    loginForm.elements.namedItem("username")?.focus();
  }
}

async function showDashboardScreen() {
  if (loginScreen) {
    loginScreen.hidden = true;
  }

  if (appShell) {
    appShell.hidden = false;
  }

  if (!dashboardInitialized) {
    await initDashboard();
    dashboardInitialized = true;
    return;
  }

  renderDashboard();
}

function handleLoginSubmit(form) {
  const usernameInput = form.elements.namedItem("username");
  const passwordInput = form.elements.namedItem("password");
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
    showFormError(form, "Username or password does not match.");
    passwordInput.focus();
    return;
  }

  localStorage.setItem(AUTH_SESSION_KEY, "true");
  showFormError(form, "");
  showDashboardScreen().catch((error) => {
    console.error(error);
  });
}

function openGroceryModal() {
  if (!groceryModal || !groceryForm) {
    return;
  }

  groceryForm.reset();
  groceryForm.elements.namedItem("date").value = getTodayString();
  showFormError(groceryForm, "");
  groceryModal.classList.add("is-open");
  groceryModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  groceryForm.elements.namedItem("merchant").focus();
}

function closeGroceryModal() {
  if (!groceryModal) {
    return;
  }

  groceryModal.classList.remove("is-open");
  groceryModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function handleGrocerySubmit(form) {
  const merchantInput = form.elements.namedItem("merchant");
  const amountInput = form.elements.namedItem("amount");
  const dateInput = form.elements.namedItem("date");
  const merchant = merchantInput.value.trim();
  const amount = parseAmount(amountInput.value);
  const date = dateInput.value;

  if (!merchant) {
    showFormError(form, "Add a merchant name.");
    merchantInput.focus();
    return;
  }

  if (Number.isNaN(amount) || amount == null || amount <= 0) {
    showFormError(form, "Enter a positive grocery amount.");
    amountInput.focus();
    return;
  }

  if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    showFormError(form, "Choose a valid purchase date.");
    dateInput.focus();
    return;
  }

  const savedTransaction = await createGroceryTransaction({
    id: `grocery-${Date.now()}`,
    merchant,
    amount,
    date,
  });

  groceryTransactions.push(savedTransaction);
  closeGroceryModal();
  renderDashboard();
}

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLoginSubmit(event.target);
});

logoutButton?.addEventListener("click", () => {
  localStorage.removeItem(AUTH_SESSION_KEY);
  showLoginScreen();
});

function focusEditingAmount(id) {
  document
    .querySelector(`[data-obligation-id="${id}"] input[name="amount"]`)
    ?.focus();
}

async function markObligationPaid(id) {
  const obligation = getObligationById(id);

  if (!obligation) {
    return;
  }

  if (obligation.amount == null) {
    editingObligationId = id;
    renderDashboard();
    focusEditingAmount(id);
    return;
  }

  const previousObligation = { ...obligation };
  Object.assign(obligation, {
    isPaid: true,
    paidDate: getTodayString(),
  });
  renderDashboard();

  try {
    Object.assign(obligation, await saveObligation(obligation));
    renderDashboard();
  } catch (error) {
    Object.assign(obligation, previousObligation);
    renderDashboard();
    throw error;
  }
}

async function undoObligationPayment(id) {
  const obligation = getObligationById(id);

  if (!obligation) {
    return;
  }

  const previousObligation = { ...obligation };
  Object.assign(obligation, {
    isPaid: false,
    paidDate: null,
  });
  renderDashboard();

  try {
    Object.assign(obligation, await saveObligation(obligation));
    renderDashboard();
  } catch (error) {
    Object.assign(obligation, previousObligation);
    renderDashboard();
    throw error;
  }
}

async function handleEditSubmit(form) {
  const obligation = getObligationById(form.dataset.id);

  if (!obligation) {
    return;
  }

  const amountInput = form.elements.amount;
  const dueDateInput = form.elements.dueDate;
  const amount = parseAmount(amountInput.value);

  if (Number.isNaN(amount) || (amount != null && amount <= 0)) {
    showFormError(form, "Enter a positive amount, or clear it to keep this TBD.");
    amountInput.focus();
    return;
  }

  const previousObligation = { ...obligation };
  Object.assign(obligation, {
    amount,
    dueDate: dueDateInput.value || null,
  });

  if (amount == null) {
    obligation.isPaid = false;
    obligation.paidDate = null;
  }

  try {
    Object.assign(obligation, await saveObligation(obligation));
    editingObligationId = null;
    renderDashboard();
  } catch (error) {
    Object.assign(obligation, previousObligation);
    showFormError(form, error.message);
  }
}

dailySpendingCard?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");

  if (actionTarget?.dataset.action === "open-grocery-modal") {
    openGroceryModal();
  }
});

groceryModal?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");

  if (event.target === groceryModal || actionTarget?.dataset.action === "close-grocery-modal") {
    closeGroceryModal();
  }
});

groceryForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleGrocerySubmit(event.target).catch((error) => {
    showFormError(event.target, error.message);
  });
});

obligationsList?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "edit") {
    editingObligationId = actionTarget.dataset.id;
    renderDashboard();
    focusEditingAmount(editingObligationId);
  }

  if (action === "mark-paid") {
    markObligationPaid(actionTarget.dataset.id).catch((error) => {
      console.error(error);
    });
  }

  if (action === "undo-payment") {
    undoObligationPayment(actionTarget.dataset.id).catch((error) => {
      console.error(error);
    });
  }

  if (action === "cancel") {
    editingObligationId = null;
    renderDashboard();
  }

  if (action === "clear-amount") {
    const form = actionTarget.closest("form");
    const amountInput = form?.elements.amount;

    if (amountInput) {
      amountInput.value = "";
      amountInput.focus();
      showFormError(form, "");
    }
  }
});

obligationsList?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleEditSubmit(event.target).catch((error) => {
    showFormError(event.target, error.message);
  });
});

obligationsList?.addEventListener("focusout", (event) => {
  if (event.target.name !== "amount") {
    return;
  }

  const amount = parseAmount(event.target.value);

  if (amount != null && !Number.isNaN(amount) && amount > 0) {
    event.target.value = formatAmountInput(amount);
  }
});

groceryForm?.addEventListener("focusout", (event) => {
  if (event.target.name !== "amount") {
    return;
  }

  const amount = parseAmount(event.target.value);

  if (amount != null && !Number.isNaN(amount) && amount > 0) {
    event.target.value = formatAmountInput(amount);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && groceryModal?.classList.contains("is-open")) {
    closeGroceryModal();
  }
});

function renderLedgerState(title, message) {
  if (cashPositionCard) {
    cashPositionCard.innerHTML = `
      <article class="cash-position-card ledger-state-card">
        <div class="cash-card-top">
          <h3>${escapeHtml(title)}</h3>
          <span class="ai-chip">${ledgerMode}</span>
        </div>
        <p>${escapeHtml(message)}</p>
      </article>
    `;
  }

  if (dailySpendingCard) {
    dailySpendingCard.innerHTML = "";
  }

  if (obligationsList) {
    obligationsList.innerHTML = "";
  }
}

async function initDashboard() {
  renderLedgerState("Loading financial data", "Syncing with Supabase...");

  try {
    const financialData = await loadDashboardDataFromSupabase();
    obligations = financialData.obligations;
    groceryTransactions = financialData.groceries;
    startingCash = financialData.startingCash;

    renderDashboard();
  } catch (error) {
    renderLedgerState(
      "Financial data unavailable",
      error instanceof Error ? error.message : "Unable to load financial data.",
    );
  }
}

if (isLoggedIn()) {
  showDashboardScreen().catch((error) => {
    console.error(error);
  });
} else {
  showLoginScreen();
}

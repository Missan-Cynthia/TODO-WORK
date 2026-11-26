import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { customerRegions } from "./customer-regions.mjs";

import { mountCustomerOrders } from "./customer-orders.mjs?v=order-search";

const app = initializeApp({
  apiKey: "AIzaSyDArt35JrQw1_Re9UgLzUMC7MOOeCRP0AY",
  authDomain: "todo-work-274d2.firebaseapp.com",
  projectId: "todo-work-274d2",
  appId: "1:861649268849:web:e12855a6aec5b6c7a8ebd0"
});
const auth = getAuth(app);
const db = getFirestore(app);
const byId = id => document.getElementById(id);
const login = byId("login");
const status = byId("status");
const city = byId("city");
const area = byId("area");
const salesRegion = byId("sales-region");
const mobile = matchMedia("(max-width: 767px) and (pointer: coarse)");
const salesRegionKey = "todo-work.sales-region";
const search = byId("search");
const monthSelect = byId("month");
const specSearch = byId("spec-search");
const dashboard = byId("dashboard");
let rows = [];
let month = "";
let areas = [];
const customerDashboard = mountCustomerOrders(byId("customer-dashboard"));
let stopRole;
let stopListening;
let stopMonth;
let current;
let currentMetadata;
let monthKeys = [];
let showAllMonths;
const allMonths = "all";
const itemFilters = new Map();

try {
  salesRegion.value = localStorage.getItem(salesRegionKey) || "";
} catch {
  // The filter also works when browser storage is unavailable.
}
if (salesRegion.selectedIndex < 0) salesRegion.value = "";

function options(select, values, allLabel, records, key) {
  const previous = select.value;
  select.replaceChildren(new Option(allLabel + "（" + records.length + "）", ""));
  for (const value of values) {
    const count = records.filter(row => row[key] === value).length;
    select.add(new Option((select === area && city.value && value.startsWith(city.value) ? value.slice(city.value.length) || value : value) + "（" + count + "）", value));
  }
  if (values.includes(previous)) select.value = previous;
}

function append(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
}

function renderItemCards(details, row, showAllByDefault) {
  const items = row.items || [];
  const arrived = items.filter(item => item.ready === true).length;
  const filters = append(details, "div", "");
  filters.className = "item-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "商品到貨狀態");
  const list = append(details, "ul", "");
  list.className = "item-cards";
  list.setAttribute("role", "list");
  const empty = append(details, "p", "此分類沒有商品。");
  empty.setAttribute("role", "status");
  const buttons = new Map();
  for (const [value, label, count] of [
    ["waiting", "待到貨", items.length - arrived],
    ["arrived", "已到貨", arrived],
    ["all", "全部", items.length]
  ]) {
    const button = append(filters, "button", label + " " + count);
    button.type = "button";
    buttons.set(value, button);
    button.addEventListener("click", () => {
      itemFilters.set(row.code, value);
      showItems(value);
    });
  }

  function showItems(filter) {
    for (const [value, button] of buttons) button.setAttribute("aria-pressed", String(value === filter));
    const visible = items.filter(item => filter === "all" || (item.ready === true) === (filter === "arrived"));
    list.replaceChildren();
    empty.hidden = visible.length > 0;
    for (const item of visible) {
      const card = append(list, "li", "");
      const body = append(card, "div", "");
      append(body, "strong", item.spec || "");
      const note = typeof item.note === "string" ? item.note.trim() : "";
      if (note) {
        const info = append(body, "div", note);
        info.className = "item-note";
        if (/來錯|送錯|待換貨|等換|退換貨/.test(note)) info.classList.add("item-note-alert");
      }
      const meta = append(card, "div", "");
      meta.className = "item-meta";
      append(meta, "strong", "數量 " + item.quantity);
      const state = append(meta, "span", item.ready === true ? "已到貨" : "待到貨");
      state.className = item.ready === true ? "item-state arrived" : "item-state";
    }
  }
  showItems(itemFilters.get(row.code) || (showAllByDefault ? "all" : "waiting"));
}

const normalizeQuery = text => String(text ?? "").normalize("NFKC").trim().toLowerCase();

function render() {
  const expanded = new Set([...byId("customers").querySelectorAll("details[open]")].map(item => item.dataset.code));
  const sorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  options(city, sorted([...rows, ...areas].map(row => row.city)), "全部縣市", rows, "city");
  const cityRows = rows.filter(row => !city.value || row.city === city.value);
  options(area, sorted([...cityRows, ...areas.filter(row => !city.value || row.city === city.value)].map(row => row.area)), "全部區域", cityRows, "area");
  const query = normalizeQuery(search.value);
  const specQuery = normalizeQuery(specSearch.value);
  const region = mobile.matches ? salesRegion.value : "";
  const visible = cityRows.filter(row => (!region || customerRegions.get(String(row.code ?? "").trim().toUpperCase()) === region)
    && (!area.value || row.area === area.value)
    && normalizeQuery(row.code + " " + row.name).includes(query))
    .map(row => specQuery ? { ...row, items: (row.items || []).filter(item => normalizeQuery(item.spec).includes(specQuery)) } : row)
    .filter(row => !specQuery || row.items.length);
  const ready = visible.filter(row => row.waiting === 0).length;
  const partial = visible.filter(row => row.ready > 0 && row.waiting > 0).length;
  byId("counts").textContent = [month, "未出貨 " + visible.length + " 家", "到齊 " + ready + " 家",
    "部分到貨 " + partial + " 家", "全未到貨 " + (visible.length - ready - partial) + " 家"].join("｜");
  const list = byId("customers");
  list.replaceChildren();
  if (!visible.length) append(list, "p", "沒有符合條件的客戶。");
  for (const row of visible) {
    const card = document.createElement("article");
    append(card, "strong", row.name);
    append(card, "p", [row.code, row.city, row.area].filter(Boolean).join(" · "));
    append(card, "p", "已到 " + row.ready + " 項，缺 " + row.waiting + " 項");
    if (row.waiting) append(card, "p", "預計到貨：" + (row.eta || "待確認"));
    const details = document.createElement("details");
    details.dataset.code = row.code;
    details.open = Boolean(specQuery) || expanded.has(row.code);
    append(details, "summary", "地址與商品明細");
    append(details, "p", row.address || "地址待確認");
    renderItemCards(details, row, !mobile.matches || Boolean(specQuery));
    card.append(details);
    list.append(card);
  }
}

function showMonth(data, metadata) {
  rows = data?.customers || [];
  month = data?.month || monthSelect.value.replace("-", "/");
  const time = data?.updatedAt?.toDate().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  status.textContent = data
    ? (metadata.fromCache ? "目前顯示上次下載的資料。 " : "") + (time ? "最後同步 " + time : "")
    : "這個月份尚無同步資料。";
  render();
}

function subscribeAllMonths() {
  const results = new Map();
  const keys = monthKeys;
  showAllMonths = () => {
    const customers = new Map();
    const available = [{ data: current, metadata: currentMetadata }, ...keys.filter(key => results.has(key)).map(key => results.get(key))];
    for (const { data } of available) {
      for (const row of data?.customers || []) {
        const code = String(row.code ?? "").trim().toUpperCase();
        if (!customers.has(code)) customers.set(code, { ...row, ready: 0, waiting: 0, items: [], estimates: new Set() });
        const customer = customers.get(code);
        customer.ready += row.ready || 0;
        customer.waiting += row.waiting || 0;
        for (const item of row.items || []) customer.items.push(item);
        if (row.waiting && row.eta) customer.estimates.add(row.eta);
      }
    }
    rows = [...customers.values()].map(customer => ({ ...customer, eta: [...customer.estimates].join("、") }));
    month = "全部月份";
    if (results.size < keys.length) status.textContent = "正在取得其他月份的到貨資料…";
    else if (available.some(result => !result.data)) status.textContent = "部分月份的資料暫時無法取得，查詢結果可能不完整。";
    else if (available.some(result => result.metadata.fromCache)) status.textContent = "部分月份顯示上次下載的資料。";
    else status.textContent = "";
    render();
  };
  showAllMonths();
  const listeners = keys.map(key => onSnapshot(doc(db, "arrivals", key), { includeMetadataChanges: true }, snapshot => {
    results.set(key, { data: snapshot.data(), metadata: snapshot.metadata });
    showAllMonths();
  }, () => {
    results.set(key, {});
    showAllMonths();
  }));
  return () => {
    for (const unsubscribe of listeners) unsubscribe();
    showAllMonths = undefined;
  };
}

function subscribeMonth() {
  stopMonth?.();
  stopMonth = undefined;
  itemFilters.clear();
  const selected = monthSelect.value;
  if (!selected) {
    if (current) showMonth(current, currentMetadata);
    return;
  }
  if (selected === allMonths) {
    stopMonth = subscribeAllMonths();
    return;
  }
  rows = [];
  month = selected.replace("-", "/");
  byId("counts").textContent = "";
  byId("customers").replaceChildren();
  status.textContent = "正在取得 " + month + " 的到貨資料…";
  stopMonth = onSnapshot(doc(db, "arrivals", selected), { includeMetadataChanges: true }, snapshot => {
    showMonth(snapshot.data(), snapshot.metadata);
  }, () => {
    rows = [];
    render();
    status.textContent = "無法取得這個月份的到貨資料。";
  });
}

for (const field of [city, area, search]) field.addEventListener("input", render);
specSearch.addEventListener("input", () => {
  itemFilters.clear();
  render();
});
monthSelect.addEventListener("change", subscribeMonth);
salesRegion.addEventListener("change", () => {
  try {
    localStorage.setItem(salesRegionKey, salesRegion.value);
  } catch {
    // Keep the current selection for this page.
  }
  render();
});
mobile.addEventListener("change", render);
login.addEventListener("submit", async event => {
  event.preventDefault();
  const button = login.querySelector("button");
  button.disabled = true;
  try {
    const account = byId("account").value.trim();
    const email = account.includes("@") ? account : account + "@todowork.app";
    await signInWithEmailAndPassword(auth, email, byId("password").value);
    login.reset();
  } catch {
    status.textContent = "登入失敗，請確認帳號和密碼後重試。";
  } finally {
    button.disabled = false;
  }
});
byId("logout").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, user => {
  stopRole?.();
  stopListening?.();
  stopListening = undefined;
  customerDashboard.clear();
  stopMonth?.();
  stopMonth = undefined;
  current = undefined;
  monthKeys = [];
  itemFilters.clear();
  rows = [];
  month = "";
  areas = [];
  search.value = "";
  specSearch.value = "";
  monthSelect.replaceChildren();
  render();
  dashboard.hidden = true;
  login.hidden = Boolean(user);
  byId("logout").hidden = !user;
  status.textContent = user ? "正在取得到貨資料…" : "請使用已授權的帳號登入。";
  if (!user) return;
  stopRole = onSnapshot(doc(db, "customerReaders", user.uid), { includeMetadataChanges: true }, role => {
    if (role.metadata.fromCache) return;
    stopListening?.();
    stopListening = undefined;
    stopMonth?.();
    stopMonth = undefined;
    customerDashboard.clear();
    dashboard.hidden = true;
    status.textContent = "正在取得到貨資料…";
    if (!role.exists()) {
      subscribeStaffDashboard();
      return;
    }
    const access = role.data();
    if (access.enabled !== true || access.customerNo !== "HC0759") {
      status.textContent = "這個帳號沒有查看權限。";
      return;
    }
    stopListening = onSnapshot(doc(db, "customerArrivals", access.customerNo), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) {
        customerDashboard.clear();
        status.textContent = "出貨端尚未同步 HC0759 的訂單。";
        return;
      }
      customerDashboard.show(snapshot.data());
      status.textContent = "";
    }, () => {
      customerDashboard.clear();
      status.textContent = "無法取得 HC0759 的訂單，請重新登入。";
    });
  }, () => {
    stopListening?.();
    stopMonth?.();
    customerDashboard.clear();
    dashboard.hidden = true;
    status.textContent = "無法確認帳號權限，請重新登入。";
  });
});

function subscribeStaffDashboard() {
  stopListening = onSnapshot(doc(db, "arrivals", "current"), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.data();
    if (!data) {
      stopMonth?.();
      stopMonth = undefined;
      dashboard.hidden = true;
      status.textContent = snapshot.metadata.fromCache ? "尚未連線到伺服器。" : "出貨端尚未同步資料。";
      return;
    }
    current = data;
    currentMetadata = snapshot.metadata;
    areas = data.areas || [];
    const previous = monthSelect.value;
    const months = [...new Set((Array.isArray(data.months) ? data.months : [])
      .filter(key => typeof key === "string" && /^\d{3,}-(0[1-9]|1[0-2])$/.test(key)))];
    const monthKeysChanged = months.join(",") !== monthKeys.join(",");
    monthKeys = months;
    monthSelect.replaceChildren(new Option("本期 " + (data.month || ""), ""));
    monthSelect.add(new Option("全部月份（不分月）", allMonths));
    for (const key of months) monthSelect.add(new Option(key.replace("-", "/"), key));
    if (previous === allMonths || months.includes(previous)) monthSelect.value = previous;
    dashboard.hidden = false;
    if (monthSelect.value === allMonths) {
      if (monthKeysChanged || !showAllMonths) subscribeMonth();
      else showAllMonths();
    } else if (!monthSelect.value && previous) subscribeMonth();
    else if (!monthSelect.value) showMonth(current, currentMetadata);
    else render();
  }, error => {
    stopMonth?.();
    stopMonth = undefined;
    dashboard.hidden = true;
    status.textContent = error.code === "permission-denied" ? "這個帳號沒有查看權限。" : "無法取得到貨資料，請重試。";
  });
}

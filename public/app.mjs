import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { customerRegions } from "./customer-regions.mjs";

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
const dashboard = byId("dashboard");
let rows = [];
let month = "";
let areas = [];
let stopListening;

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

function render() {
  const expanded = new Set([...byId("customers").querySelectorAll("details[open]")].map(item => item.dataset.code));
  const sorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  options(city, sorted([...rows, ...areas].map(row => row.city)), "全部縣市", rows, "city");
  const cityRows = rows.filter(row => !city.value || row.city === city.value);
  options(area, sorted([...cityRows, ...areas.filter(row => !city.value || row.city === city.value)].map(row => row.area)), "全部區域", cityRows, "area");
  const query = search.value.trim().toLowerCase();
  const region = mobile.matches ? salesRegion.value : "";
  const visible = cityRows.filter(row => (!region || customerRegions.get(String(row.code ?? "").trim().toUpperCase()) === region)
    && (!area.value || row.area === area.value)
    && (row.code + " " + row.name).toLowerCase().includes(query));
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
    details.open = expanded.has(row.code);
    append(details, "summary", "地址與商品明細");
    append(details, "p", row.address || "地址待確認");
    const items = document.createElement("ul");
    for (const item of row.items || []) append(items, "li", [item.spec, "數量 " + item.quantity, item.ready ? "已到貨" : "待到貨"].join(" · "));
    details.append(items);
    card.append(details);
    list.append(card);
  }
}

for (const field of [city, area, search]) field.addEventListener("input", render);
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
  if (stopListening) stopListening();
  rows = [];
  month = "";
  areas = [];
  search.value = "";
  render();
  dashboard.hidden = true;
  login.hidden = Boolean(user);
  byId("logout").hidden = !user;
  status.textContent = user ? "正在取得到貨資料…" : "請使用已授權的帳號登入。";
  if (!user) return;
  stopListening = onSnapshot(doc(db, "arrivals", "current"), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.data();
    if (!data) {
      dashboard.hidden = true;
      status.textContent = snapshot.metadata.fromCache ? "尚未連線到伺服器。" : "出貨端尚未同步資料。";
      return;
    }
    rows = data.customers || [];
    areas = data.areas || [];
    month = data.month || "";
    const time = data.updatedAt?.toDate().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
    status.textContent = (snapshot.metadata.fromCache ? "目前顯示上次下載的資料。 " : "") + (time ? "最後同步 " + time : "");
    dashboard.hidden = false;
    render();
  }, error => {
    dashboard.hidden = true;
    status.textContent = error.code === "permission-denied" ? "這個帳號沒有查看權限。" : "無法取得到貨資料，請重試。";
  });
});

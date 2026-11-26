const compareNumber = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" }).compare;
const compareDate = (a, b) => (a || "9999-99-99").localeCompare(b || "9999-99-99");
const periodValue = period => /^\d{3,}\/(0[1-9]|1[0-2])$/.test(period || "")
  ? Number(period.replace("/", "")) : NaN;

export function customerOrders(lines, period, sort) {
  const groups = new Map();
  for (const line of lines) {
    if (period && !(periodValue(line.period) <= periodValue(period))) continue;
    if (!groups.has(line.group)) groups.set(line.group, { number: line.number, items: [] });
    groups.get(line.group).items.push(line);
  }
  const orders = [...groups.values()];
  for (const order of orders) {
    order.items.sort((a, b) => compareDate(a.dateKey, b.dateKey));
  }
  const byNumber = (a, b) => Number(!a.number) - Number(!b.number) || compareNumber(a.number, b.number);
  const byDate = (a, b) => compareDate(a.items[0].dateKey, b.items[0].dateKey);
  return orders.sort((a, b) => sort === "date" ? byDate(a, b) || byNumber(a, b) : byNumber(a, b) || byDate(a, b));
}

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

export function mountCustomerOrders(root) {
  root.innerHTML = `
    <h2>HC0759 未出貨訂單</h2>
    <div class="filters">
      <label>交貨月份<select data-period></select></label>
      <label>排序<select data-sort>
        <option value="number">客戶訂單號碼</option>
        <option value="date">交期</option>
      </select></label>
    </div>
    <p data-count role="status"></p>
    <div class="customer-orders" data-orders></div>`;
  const period = root.querySelector("[data-period]");
  const sort = root.querySelector("[data-sort]");
  const count = root.querySelector("[data-count]");
  const list = root.querySelector("[data-orders]");
  let current = "";
  let lines = [];
  function render() {
    const orders = customerOrders(lines, period.value === "current" ? current : (period.value === "all" ? "" : period.value), sort.value);
    count.textContent = orders.length
      ? `${orders.length} 張訂單・${orders.reduce((total, order) => total + order.items.length, 0)} 筆商品`
      : "這個期別目前沒有未出貨訂單。";
    list.replaceChildren(...orders.map(order => {
      const card = element("article");
      const heading = element("header", "", "customer-order-heading");
      heading.append(
        element("span", "客戶訂單號碼"),
        element("h3", order.number || "未填"),
        element("small", `${order.items.length} 筆品項`)
      );
      card.append(heading);
      const filters = element("div", "", "item-filters");
      filters.setAttribute("role", "group");
      filters.setAttribute("aria-label", "商品到貨狀態");
      const items = element("ul", "", "item-cards");
      items.setAttribute("role", "list");
      const empty = element("p", "此分類沒有商品。");
      const arrived = order.items.filter(item => item.ready === true).length;
      const buttons = new Map();
      for (const [value, label, count] of [
        ["waiting", "待到貨", order.items.length - arrived],
        ["arrived", "已到貨", arrived],
        ["all", "全部", order.items.length]
      ]) {
        const button = element("button", label + " " + count);
        button.type = "button";
        button.addEventListener("click", () => showItems(value));
        buttons.set(value, button);
        filters.append(button);
      }
      function showItems(filter) {
        for (const [value, button] of buttons) button.setAttribute("aria-pressed", String(value === filter));
        const visible = order.items.filter(item => filter === "all" || (item.ready === true) === (filter === "arrived"));
        empty.hidden = visible.length > 0;
        items.replaceChildren(...visible.map(item => {
          const row = element("li");
          const details = element("div");
          details.append(
            element("strong", item.spec || "未填商品規格"),
            element("div", "預交 " + (item.date || "未填"), "item-note")
          );
          const meta = element("div", "", "item-meta");
          meta.append(
            element("strong", "數量 " + item.quantity),
            element("span", item.ready ? "已到貨" : "待到貨",
              item.ready ? "item-state arrived" : "item-state")
          );
          row.append(details, meta);
          return row;
        }));
      }
      card.append(filters, items, empty);
      showItems("all");
      return card;
    }));
  }
  period.addEventListener("change", render);
  sort.addEventListener("change", render);
  return {
    show(data) {
      const previous = period.value || "current";
      current = data.month;
      lines = data.lines || [];
      const months = [...new Set(lines.map(line => line.period).filter(key => Number.isFinite(periodValue(key))))];
      months.sort((a, b) => periodValue(b) - periodValue(a));
      period.replaceChildren(
        new Option("本期 " + current, "current"),
        new Option("全部月份", "all"),
        ...months.filter(key => key !== current).map(key => new Option(key, key))
      );
      if ([...period.options].some(option => option.value === previous)) period.value = previous;
      root.hidden = false;
      render();
    },
    clear() {
      root.hidden = true;
      lines = [];
      list.replaceChildren();
      period.replaceChildren();
    }
  };
}

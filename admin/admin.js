const SUPABASE_URL = "https://snvwhvwvkfsahpjpfgnd.supabase.co";
const SUPABASE_KEY =
  "sb_publishable_OGLtqAGFM3pST-SFJfUL7w_FWSYN-ME";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const els = {
  loginCard: document.querySelector("#login-card"),
  adminApp: document.querySelector("#admin-app"),
  passwordLoginForm: document.querySelector("#password-login-form"),
  emailInput: document.querySelector("#email-input"),
  passwordInput: document.querySelector("#password-input"),
  loginMessage: document.querySelector("#login-message"),
  signOut: document.querySelector("#sign-out-button"),
  userCount: document.querySelector("#user-count"),
  postCount: document.querySelector("#post-count"),
  openReportCount: document.querySelector("#open-report-count"),
  statusFilter: document.querySelector("#status-filter"),
  refresh: document.querySelector("#refresh-button"),
  reportsList: document.querySelector("#reports-list"),
};

let currentUser = null;

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
}

function setMessage(message) {
  els.loginMessage.textContent = message || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function targetLabel(type) {
  return {
    post: "Post",
    comment: "Yorum",
    message: "Mesaj",
    user: "Kullanıcı",
  }[type] || type;
}

function statusLabel(status) {
  return {
    open: "Açık",
    reviewed: "İncelendi",
    dismissed: "Reddedildi",
    actioned: "Aksiyon alındı",
  }[status] || status;
}

async function init() {
  els.passwordLoginForm.addEventListener("submit", signInWithPassword);
  els.signOut.addEventListener("click", signOut);
  els.refresh.addEventListener("click", loadDashboard);
  els.statusFilter.addEventListener("change", loadReports);

  const { data } = await client.auth.getSession();
  currentUser = data.session?.user ?? null;
  await renderAuthState();

  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    await renderAuthState();
  });
}

async function signInWithPassword(event) {
  event.preventDefault();
  const button = els.passwordLoginForm.querySelector("button");
  setBusy(button, true);
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  setBusy(button, false);
  if (error) {
    setMessage(`Giriş başarısız: ${error.message}`);
    return;
  }

  currentUser = data.user;
  els.passwordInput.value = "";
  await renderAuthState();
}

async function signOut() {
  await client.auth.signOut();
  currentUser = null;
  await renderAuthState();
}

async function renderAuthState() {
  if (!currentUser) {
    els.loginCard.hidden = false;
    els.adminApp.hidden = true;
    els.signOut.hidden = true;
    return;
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("id, username, is_admin")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error || profile?.is_admin !== true) {
    els.loginCard.hidden = false;
    els.adminApp.hidden = true;
    els.signOut.hidden = false;
    setMessage(
      "Bu hesap admin değil. Admin yetkisi olan hesapla giriş yapmalısın.",
    );
    return;
  }

  setMessage("");
  els.loginCard.hidden = true;
  els.adminApp.hidden = false;
  els.signOut.hidden = false;
  await loadDashboard();
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadReports()]);
}

async function loadStats() {
  const [users, posts, openReports] = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("posts").select("id", { count: "exact", head: true }),
    client
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  els.userCount.textContent = users.count ?? "-";
  els.postCount.textContent = posts.count ?? "-";
  els.openReportCount.textContent = openReports.count ?? "-";
}

async function loadReports() {
  els.reportsList.innerHTML = '<div class="empty-state">Yükleniyor...</div>';
  let query = client
    .from("content_reports")
    .select(
      "*, reporter:profiles!content_reports_reporter_id_fkey(username), reported:profiles!content_reports_reported_user_id_fkey(username)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const status = els.statusFilter.value;
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    els.reportsList.innerHTML = `<div class="empty-state">Raporlar alınamadı: ${escapeHtml(
      error.message,
    )}</div>`;
    return;
  }

  if (!data?.length) {
    els.reportsList.innerHTML =
      '<div class="empty-state">Bu filtrede rapor yok.</div>';
    return;
  }

  const details = await loadTargetDetails(data);
  els.reportsList.innerHTML = data
    .map((report) => renderReport(report, details.get(report.id)))
    .join("");

  els.reportsList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleReportAction);
  });
}

async function loadTargetDetails(reports) {
  const details = new Map();
  await Promise.all(
    reports.map(async (report) => {
      const id = report.target_id;
      if (report.target_type === "post") {
        const { data } = await client
          .from("posts")
          .select("id, content, created_at, profiles!posts_user_id_fkey(username)")
          .eq("id", id)
          .maybeSingle();
        details.set(report.id, data);
      } else if (report.target_type === "comment") {
        const { data } = await client
          .from("comments")
          .select("id, content, created_at, profiles!comments_user_id_fkey(username)")
          .eq("id", id)
          .maybeSingle();
        details.set(report.id, data);
      }
    }),
  );
  return details;
}

function renderReport(report, detail) {
  const targetExists = Boolean(detail);
  const canDelete =
    targetExists &&
    (report.target_type === "post" || report.target_type === "comment");

  return `
    <article class="report-card" data-report-id="${escapeHtml(report.id)}">
      <div class="report-top">
        <div class="badge-row">
          <span class="badge ${report.status === "open" ? "danger" : ""}">
            ${escapeHtml(statusLabel(report.status))}
          </span>
          <span class="badge">${escapeHtml(targetLabel(report.target_type))}</span>
          ${
            targetExists
              ? '<span class="badge">İçerik bulundu</span>'
              : '<span class="badge warning">İçerik silinmiş olabilir</span>'
          }
        </div>
        <span class="meta">${escapeHtml(formatDate(report.created_at))}</span>
      </div>

      <div class="report-body">
        <strong>Şikayet nedeni: ${escapeHtml(report.reason)}</strong>
        ${
          report.note
            ? `<p>Not: ${escapeHtml(report.note)}</p>`
            : '<p class="meta">Ek not yok.</p>'
        }
        <p class="meta">
          Raporlayan: ${escapeHtml(report.reporter?.username || report.reporter_id)}
          · Şikayet edilen: ${escapeHtml(
            report.reported?.username || report.reported_user_id || "-",
          )}
        </p>
        <div class="report-content">
          ${escapeHtml(detail?.content || "İçerik önizlemesi yok.")}
        </div>
      </div>

      <div class="report-actions">
        <div class="actions-left">
          <button class="ghost-button" data-action="status" data-status="reviewed" data-id="${escapeHtml(
            report.id,
          )}">İncelendi</button>
          <button class="ghost-button" data-action="status" data-status="dismissed" data-id="${escapeHtml(
            report.id,
          )}">Reddet</button>
          <button class="ghost-button" data-action="status" data-status="actioned" data-id="${escapeHtml(
            report.id,
          )}">Aksiyon alındı</button>
        </div>
        <div class="actions-right">
          ${
            canDelete
              ? `<button class="ghost-button danger-button" data-action="delete-target" data-target-type="${escapeHtml(
                  report.target_type,
                )}" data-target-id="${escapeHtml(
                  report.target_id,
                )}" data-report-id="${escapeHtml(report.id)}">İçeriği sil</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

async function handleReportAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  setBusy(button, true);

  try {
    if (action === "status") {
      await updateReportStatus(button.dataset.id, button.dataset.status);
    }
    if (action === "delete-target") {
      await deleteTarget(
        button.dataset.targetType,
        button.dataset.targetId,
        button.dataset.reportId,
      );
    }
    await loadDashboard();
  } catch (error) {
    alert(error.message || error);
  } finally {
    setBusy(button, false);
  }
}

async function updateReportStatus(id, status) {
  const { error } = await client
    .from("content_reports")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function deleteTarget(targetType, targetId, reportId) {
  const label = targetType === "post" ? "postu" : "yorumu";
  if (!window.confirm(`Bu ${label} silinsin mi? Bu işlem geri alınamaz.`)) {
    return;
  }

  const table = targetType === "post" ? "posts" : "comments";
  const { error } = await client.from(table).delete().eq("id", targetId);
  if (error) throw error;
  await updateReportStatus(reportId, "actioned");
}

init().catch((error) => {
  els.reportsList.innerHTML = `<div class="empty-state">Panel başlatılamadı: ${escapeHtml(
    error.message || error,
  )}</div>`;
});

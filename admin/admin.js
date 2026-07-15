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
  userSearch: document.querySelector("#user-search-input"),
  postSearch: document.querySelector("#post-search-input"),
  usersList: document.querySelector("#users-list"),
  postsList: document.querySelector("#posts-list"),
  reportsList: document.querySelector("#reports-list"),
  sectionButtons: document.querySelectorAll("[data-section-target]"),
  sections: document.querySelectorAll("[data-section]"),
};

let currentUser = null;
let cachedUsers = [];
let cachedPosts = [];

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
  els.userSearch.addEventListener("input", renderUsers);
  els.postSearch.addEventListener("input", renderPosts);
  els.sectionButtons.forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.sectionTarget));
  });

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
  await Promise.all([loadStats(), loadUsers(), loadPosts(), loadReports()]);
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

async function loadUsers() {
  els.usersList.innerHTML = '<div class="empty-state">Kullanıcılar yükleniyor...</div>';
  const { data, error } = await client.rpc("admin_users");
  if (error) {
    els.usersList.innerHTML = `<div class="empty-state">Kullanıcılar alınamadı: ${escapeHtml(
      error.message,
    )}</div>`;
    return;
  }

  cachedUsers = data || [];
  renderUsers();
}

function renderUsers() {
  const search = els.userSearch.value.trim().toLocaleLowerCase("tr-TR");
  const users = cachedUsers.filter((user) => {
    if (!search) return true;
    return [user.email, user.username, user.ilac, user.cinsiyet]
      .filter(Boolean)
      .some((value) =>
        String(value).toLocaleLowerCase("tr-TR").includes(search),
      );
  });

  if (!users.length) {
    els.usersList.innerHTML =
      '<div class="empty-state">Bu aramada kullanıcı yok.</div>';
    return;
  }

  els.usersList.innerHTML = users.map(renderUser).join("");
}

function renderUser(user) {
  return `
    <article class="user-row">
      <div class="user-avatar">${escapeHtml(
        (user.username || user.email || "?").trim().charAt(0).toUpperCase(),
      )}</div>
      <div class="user-main">
        <strong>${escapeHtml(user.username || "İsimsiz kullanıcı")}</strong>
        <span>${escapeHtml(user.email || "E-posta yok")}</span>
        <span class="meta">Kayıt: ${escapeHtml(formatDate(user.created_at))}</span>
      </div>
      <div class="user-badges">
        ${user.is_admin ? '<span class="badge danger">Admin</span>' : ""}
        <span class="badge ${user.onboarding_completed ? "" : "warning"}">
          ${user.onboarding_completed ? "Onboarding tamam" : "Onboarding eksik"}
        </span>
        <span class="badge">${escapeHtml(user.ilac || "İlaç yok")}</span>
        <span class="badge">${escapeHtml(user.cinsiyet || "Cinsiyet yok")}</span>
        <span class="badge">${Number(user.post_count || 0)} post</span>
      </div>
    </article>
  `;
}

async function loadPosts() {
  els.postsList.innerHTML = '<div class="empty-state">Postlar yükleniyor...</div>';
  const { data, error } = await client
    .from("posts")
    .select("id, content, created_at, post_type, group_slug, tags, profiles!posts_user_id_fkey(username)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    els.postsList.innerHTML = `<div class="empty-state">Postlar alınamadı: ${escapeHtml(
      error.message,
    )}</div>`;
    return;
  }

  cachedPosts = data || [];
  renderPosts();
}

function renderPosts() {
  const search = els.postSearch.value.trim().toLocaleLowerCase("tr-TR");
  const posts = cachedPosts.filter((post) => {
    if (!search) return true;
    return [
      post.content,
      post.profiles?.username,
      post.post_type,
      post.group_slug,
      ...(post.tags || []),
    ]
      .filter(Boolean)
      .some((value) =>
        String(value).toLocaleLowerCase("tr-TR").includes(search),
      );
  });

  if (!posts.length) {
    els.postsList.innerHTML =
      '<div class="empty-state">Bu aramada post yok.</div>';
    return;
  }

  els.postsList.innerHTML = posts.map(renderPost).join("");
  els.postsList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleReportAction);
  });
}

function renderPost(post) {
  return `
    <article class="report-card">
      <div class="report-top">
        <div class="badge-row">
          <span class="badge">${escapeHtml(post.post_type || "post")}</span>
          <span class="badge">${escapeHtml(post.group_slug || "genel")}</span>
        </div>
        <span class="meta">${escapeHtml(formatDate(post.created_at))}</span>
      </div>
      <div class="report-body">
        <strong>${escapeHtml(post.profiles?.username || "Üye")}</strong>
        <div class="report-content">${escapeHtml(post.content || "Boş içerik")}</div>
        ${
          post.tags?.length
            ? `<p class="meta">Etiketler: ${escapeHtml(post.tags.join(", "))}</p>`
            : ""
        }
      </div>
      <div class="report-actions">
        <div class="actions-left"></div>
        <div class="actions-right">
          <button class="ghost-button danger-button" data-action="delete-post" data-target-id="${escapeHtml(
            post.id,
          )}">Postu sil</button>
        </div>
      </div>
    </article>
  `;
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
    if (action === "delete-post") {
      await deletePost(button.dataset.targetId);
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

async function deletePost(postId) {
  if (!window.confirm("Bu post silinsin mi? Bu işlem geri alınamaz.")) {
    return;
  }

  const { error } = await client.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

function showSection(sectionName) {
  els.sections.forEach((section) => {
    section.hidden = section.dataset.section !== sectionName;
  });

  els.sectionButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.sectionTarget === sectionName,
    );
  });
}

init().catch((error) => {
  els.reportsList.innerHTML = `<div class="empty-state">Panel başlatılamadı: ${escapeHtml(
    error.message || error,
  )}</div>`;
});

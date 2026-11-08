/* =========================================================
  Motify - app.js
   Shared UI helpers used across every page: navbar, footer,
   formatting, the PRD's open/closed + maps logic, and the
   reusable part-card renderer.
   ========================================================= */

/* ---------- PRD LOGIC: open/closed status + maps ---------- */
function getShopOperatingStatus(openingTimeStr, closingTimeStr, daysStr){
  const now = new Date();
  const day = now.getDay(); // 0 Sun ... 6 Sat
  if(daysStr === "Mon-Sat" && day === 0){
    return {isOpen:false, text:"Closed (Sunday)"};
  }
  const [oh,om] = openingTimeStr.split(':').map(Number);
  const [ch,cm] = closingTimeStr.split(':').map(Number);
  const openTime = new Date(now); openTime.setHours(oh,om,0,0);
  const closeTime = new Date(now); closeTime.setHours(ch,cm,0,0);
  const isOpen = now >= openTime && now <= closeTime;
  return {isOpen, text: isOpen ? "Open now" : "Closed"};
}
function getGoogleMapsDirectionsUrl(lat,lng,name){
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`;
}
function getMapEmbedUrl(lat,lng){
  return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

/* ---------- formatting ---------- */
function ghs(n){ return "GH₵ " + Number(n).toFixed(2); }
function timeAgo(ts){
  const mins = Math.round((Date.now()-ts)/60000);
  if(mins < 1) return "just now";
  if(mins < 60) return mins+"m ago";
  const hrs = Math.round(mins/60);
  if(hrs < 24) return hrs+"h ago";
  return Math.round(hrs/24)+"d ago";
}
function qs(param){ return new URLSearchParams(window.location.search).get(param); }
function trackEvent(name, details={}){
  try{
    const events = JSON.parse(localStorage.getItem("kmp_analytics") || "[]");
    events.push({name, details, at:Date.now()});
    localStorage.setItem("kmp_analytics", JSON.stringify(events.slice(-250)));
  }catch(e){ /* analytics must never block the app */ }
}
function partFreshness(ts){
  if(!ts) return "Stock update pending";
  const days = Math.max(0, Math.floor((Date.now()-(ts || Date.now()))/86400000));
  return days === 0 ? "Updated today" : days === 1 ? "Updated yesterday" : `Updated ${days} days ago`;
}

function initScrollAnimations(){
  const animatedSelectors = '.hero-copy, .hero-search, .stat-bar .grid4 > div, .trust-grid > div, .section-head, .pcard, .zone-card, .step-card, .testimonial-card, .card, .shop-page-header';
  const revealElements = root => {
    const elements = root.matches?.(animatedSelectors) ? [root, ...root.querySelectorAll(animatedSelectors)] : [...root.querySelectorAll(animatedSelectors)];
    elements.forEach((element, index)=>{
    if(element.classList.contains('reveal-ready')) return;
    element.classList.add('reveal-ready');
    element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 70}ms`);
    animationObserver?.observe(element);
    });
  };
  const animationObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      animationObserver.unobserve(entry.target);
    });
  }, {threshold:0.12, rootMargin:'0px 0px -35px'}) : null;
  if(!animationObserver) return;
  revealElements(document);
  const dynamicContent = new MutationObserver(mutations=>mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{
    if(node.nodeType === Node.ELEMENT_NODE) revealElements(node);
  })));
  dynamicContent.observe(document.body, {childList:true, subtree:true});
}

/* ---------- toast ---------- */
function ensureToastEl(){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast"; t.className = "toast";
    document.body.appendChild(t);
  }
  return t;
}
function toast(msg){
  const t = ensureToastEl();
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove("show"), 2400);
}

/* ---------- server error banner ---------- */
function showLoadError(err){
  console.error(err);
  const message = err && err.message ? err.message : String(err);
  let banner = document.getElementById("apiErrorBanner");
  if(!banner){
    banner = document.createElement("div");
    banner.id = "apiErrorBanner";
    banner.className = "notice-banner";
    banner.style.margin = "16px auto";
    banner.style.maxWidth = "1120px";
    document.body.insertBefore(banner, document.body.firstChild);
  }
  banner.innerHTML = `<strong>Could not load Motify data.</strong> ${message}`;
}

/* ---------- navbar ---------- */
function renderNavbar(activePage){
  const target = document.getElementById("navbar-target");
  if(!target) return;
  const user = (typeof Auth !== "undefined") ? Auth.currentUser() : null;

  const guestLinks = `
    <a href="parts.html" class="${activePage==='parts'?'active':''}">Browse parts</a>
    <a href="about.html" class="${activePage==='about'?'active':''}">About</a>
  `;
  const riderLinks = `
    <a href="parts.html" class="${activePage==='parts'?'active':''}">Browse parts</a>
    <a href="rider-dashboard.html" class="${activePage==='rider-dashboard'?'active':''}">Dashboard</a>
    <a href="my-reservations.html" class="${activePage==='my-reservations'?'active':''}">Reservations</a>
    <a href="saved-shops.html" class="${activePage==='saved-shops'?'active':''}">Saved shops</a>
  `;
  const vendorLinks = `
    <a href="vendor-dashboard.html" class="${activePage==='vendor-dashboard'?'active':''}">Dashboard</a>
    <a href="my-inventory.html" class="${activePage==='my-inventory'?'active':''}">Inventory</a>
    <a href="reservations-inbox.html" class="${activePage==='reservations-inbox'?'active':''}">Reservations</a>
    <a href="shop-profile.html" class="${activePage==='shop-profile'?'active':''}">Shop &amp; fitter</a>
  `;
  const adminLinks = `
    <a href="admin-dashboard.html" class="${activePage==='admin-dashboard'?'active':''}">Overview</a>
    <a href="vendor-verification.html" class="${activePage==='vendor-verification'?'active':''}">Verification</a>
    <a href="manage-categories.html" class="${activePage==='manage-categories'?'active':''}">Categories</a>
    <a href="manage-users.html" class="${activePage==='manage-users'?'active':''}">Users</a>
    <a href="reports.html" class="${activePage==='reports'?'active':''}">Reports</a>
  `;

  let links = guestLinks;
  if(user?.role==="rider") links = riderLinks;
  if(user?.role==="vendor") links = vendorLinks;
  if(user?.role==="admin") links = adminLinks;

  const actions = user ? `
    <a href="profile.html" class="nav-role-pill">${user.name.split(' ')[0]} &middot; ${user.role}</a>
    <a href="notifications.html" class="btn btn-ghost btn-sm">Notifications</a>
    <button class="btn btn-outline btn-sm" id="navLogoutBtn">Log out</button>
  ` : `
    <a href="login.html" class="btn btn-outline btn-sm">Log in</a>
    <a href="register.html" class="btn btn-primary btn-sm">Sign up</a>
  `;

  target.innerHTML = `
    <div class="navbar">
      <div class="container navbar-inner">
        <a href="index.html" class="brand">
          <span class="brand-text">Motify</span>
        </a>
        <button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-navigation">
          <span></span><span></span><span></span><b class="sr-only">Open menu</b>
        </button>
        <div class="mobile-navigation" id="mobile-navigation">
          <nav class="nav-links">${links}</nav>
          <div class="nav-actions">${actions}</div>
        </div>
      </div>
    </div>
  `;
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navbar = target.querySelector('.navbar');
  menuToggle?.addEventListener('click', ()=>{
    const isOpen = navbar.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.querySelector('b').textContent = isOpen ? 'Close menu' : 'Open menu';
  });
  target.querySelectorAll('.mobile-navigation a').forEach(link=>link.addEventListener('click', ()=>{
    navbar.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }));
  document.getElementById("navLogoutBtn")?.addEventListener("click", ()=> Auth.logout());
}

/* ---------- footer ---------- */
function renderFooter(){
  const target = document.getElementById("footer-target");
  if(!target) return;
  target.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-brand">
          <strong>Motify</strong>
          <span>Find the part. Call the fitter.</span>
        </div>
        <div class="footer-links">
          <div><strong>Explore</strong><a href="parts.html">Browse parts</a><a href="about.html">About us</a></div>
          <div><strong>For vendors</strong><a href="register.html?role=vendor">List your shop</a><a href="login.html">Vendor login</a></div>
          <div><strong>Pickup promise</strong><span>Reservations settle in cash or MoMo on pickup.</span></div>
        </div>
        <div class="footer-bottom"><span>Kwabenya, Accra · Local shops, practical help.</span><span><a href="support.html">Support</a> <a href="privacy.html">Privacy</a> <a href="terms.html">Terms</a> · © 2026 Motify</span></div>
      </div>
    </footer>
  `;
}

/* ---------- part card (used on index.html + parts.html) ---------- */
function renderPartCard(p){
  const shop = DB.getShopById(p.shopId) || {
    id: p.shopId, name: "Motify shop", zone: "", opening: "07:00", closing: "18:00",
    days: "Mon-Sat", verified: false
  };
  const status = getShopOperatingStatus(shop.opening, shop.closing, shop.days);
  return `
    <div class="pcard" onclick="trackEvent('part_view',{partId:'${p.id}'});location.href='part-detail.html?id=${p.id}'" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();trackEvent('part_view',{partId:'${p.id}'});location.href='part-detail.html?id=${p.id}'}" tabindex="0" role="link" aria-label="View ${p.title}">
      <div class="pcard-img">
        <img src="${PART_IMAGES[p.category]}" alt="${p.title}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('image-missing');">
        <span class="pcard-badge badge ${status.isOpen?'badge-open':'badge-closed'}">${status.text}</span>
        ${!p.available ? `<div class="oos-strip">Out of stock</div>` : ""}
      </div>
      <div class="pcard-body">
        <div class="pcard-price">${ghs(p.price)}</div>
        <div class="pcard-title">${p.title}</div>
        <div class="pcard-tags">${p.models.slice(0,2).map(m=>`<span class="pcard-tag">${m}</span>`).join("")}</div>
        ${shop.verified ? `<span class="verified-tag">✓ Verified shop</span>` : ""}
        <div class="pcard-stock">${p.available ? `${p.stock} available` : "Currently unavailable"}</div>
        <div class="pcard-freshness">${partFreshness(p.lastUpdated)}</div>
        <div class="pcard-loc"><a href="shop.html?id=${shop.id}" onclick="event.stopPropagation();trackEvent('shop_view',{shopId:'${shop.id}'})">${shop.name}</a> &middot; ${shop.zone}</div>
      </div>
    </div>
  `;
}

/* boot: always try to render navbar/footer if targets exist */
document.addEventListener("DOMContentLoaded", ()=>{
  document.body.classList.add('page-ready');
  renderFooter();
  initScrollAnimations();
});

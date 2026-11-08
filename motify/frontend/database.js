/* =========================================================
  Motify - database.js
  API-backed data layer.

  The pages still call the same synchronous helpers they always did
  (DB.getProducts(), DB.getShopById(), ...), but the data now comes from
  the Django server in /server. Each page awaits DB.ready() once, which
  loads the catalogue into an in-memory cache; mutations call the API and
  update that cache.

  API base URL resolution:
    1. window.MOTIFY_API_BASE
    2. localStorage "motify_api_base"
    3. same origin /api when the page is served by Django on port 8000
    4. http://127.0.0.1:8000/api otherwise
  ========================================================= */

const TOKEN_KEY = "motify_token_v1";
const API_BASE = (
  window.MOTIFY_API_BASE ||
  localStorage.getItem("motify_api_base") ||
  (location.port === "8000" ? location.origin + "/api" : "http://127.0.0.1:8000/api")
).replace(/\/+$/, "");

const CATEGORIES = [];
const MODELS = [];
const PART_IMAGES = {
  "Engine":"images/motor-engine.jpeg",
  "Brake System":"images/brake-system.jpeg",
  "Transmission":"images/motor-transmission.jpeg",
  "Electrical":"images/motor-electricals.jpeg",
  "Body Components":"images/motor-body-components.jpeg",
  "Tyres/Wheels":"images/tyres-and-wheels.jpeg",
  "Accessories":"images/motor-accessories.jpeg"
};
const STATUS_FLOW = ["pending","confirmed","ready_for_pickup","completed"];
const STATUS_LABEL = {pending:"Pending confirmation", confirmed:"Confirmed", ready_for_pickup:"Ready for pickup", completed:"Completed", cancelled:"Cancelled"};
const STATUS_BADGE = {pending:"badge-pending", confirmed:"badge-pending", ready_for_pickup:"badge-ready", completed:"badge-completed", cancelled:"badge-cancelled"};

/* ---------------- low-level API client ---------------- */
function apiErrorMessage(data, status){
  if(!data) return `Request failed (${status})`;
  if(typeof data === "string") return data;
  if(data.detail) return data.detail;
  if(data.non_field_errors) return [].concat(data.non_field_errors).join(" ");
  const first = Object.entries(data)[0];
  if(first){
    const value = Array.isArray(first[1]) ? first[1].join(" ") : String(first[1]);
    return `${first[0]}: ${value}`;
  }
  return `Request failed (${status})`;
}

const MotifyApi = {
  base: API_BASE,
  getToken(){ return localStorage.getItem(TOKEN_KEY); },
  setToken(token){
    if(token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },
  async request(path, { method="GET", body, auth=true } = {}){
    const headers = { "Content-Type": "application/json" };
    const token = MotifyApi.getToken();
    if(auth && token) headers.Authorization = `Token ${token}`;

    let response;
    try{
      response = await fetch(API_BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }catch(err){
      throw new Error(`Cannot reach the Motify server at ${API_BASE}. Start it with "python manage.py runserver".`);
    }

    if(response.status === 401 && token) MotifyApi.setToken(null);

    const text = await response.text();
    let data = null;
    if(text){
      try{ data = JSON.parse(text); }catch(e){ data = text; }
    }
    if(!response.ok) throw new Error(apiErrorMessage(data, response.status));
    return data;
  },
  get(path){ return MotifyApi.request(path); },
  post(path, body){ return MotifyApi.request(path, { method:"POST", body }); },
  patch(path, body){ return MotifyApi.request(path, { method:"PATCH", body }); },
  del(path){ return MotifyApi.request(path, { method:"DELETE" }); }
};

/* ---------------- in-memory cache ---------------- */
const _cache = {
  shops: [],
  products: [],
  categories: [],
  models: [],
  reservations: [],
  reviews: [],
  contactLog: [],
  users: [],
  stats: null,
  user: null
};
let _readyPromise = null;

function replaceById(list, item){
  const index = list.findIndex(entry => entry.id === item.id);
  if(index >= 0) list[index] = item; else list.push(item);
  return item;
}

async function loadEverything(){
  const [shops, products, categories, bikeModels, stats, reviews] = await Promise.all([
    MotifyApi.get("/shops/"),
    MotifyApi.get("/products/"),
    MotifyApi.get("/categories/"),
    MotifyApi.get("/bike-models/"),
    MotifyApi.get("/stats/"),
    MotifyApi.get("/reviews/")
  ]);

  _cache.shops = shops;
  _cache.products = products;
  _cache.categories = categories;
  _cache.models = bikeModels;
  _cache.stats = stats;
  _cache.reviews = reviews;

  CATEGORIES.length = 0;
  categories.forEach(category => CATEGORIES.push(category.category_name));
  MODELS.length = 0;
  bikeModels.forEach(model => MODELS.push(model.name));

  // Restore the signed-in user from the stored token, if there is one.
  _cache.user = null;
  if(MotifyApi.getToken()){
    try{
      _cache.user = await MotifyApi.get("/auth/me/");
    }catch(err){
      MotifyApi.setToken(null);
    }
  }

  // Private data depends on the signed-in role.
  _cache.reservations = [];
  _cache.contactLog = [];
  _cache.users = [];
  if(_cache.user){
    const jobs = [
      MotifyApi.get("/reservations/").then(rows => { _cache.reservations = rows; }).catch(() => {})
    ];
    if(_cache.user.role === "vendor" || _cache.user.role === "admin"){
      jobs.push(MotifyApi.get("/contact-log/").then(rows => { _cache.contactLog = rows; }).catch(() => {}));
    }
    if(_cache.user.role === "admin"){
      jobs.push(MotifyApi.get("/users/").then(rows => { _cache.users = rows; }).catch(() => {}));
    }
    await Promise.all(jobs);
  }
}

/* ---------------- public DB helpers ---------------- */
const DB = {
  api: MotifyApi,
  apiBase: API_BASE,

  /* Call once per page before rendering. */
  ready(){
    if(!_readyPromise){
      _readyPromise = loadEverything().catch(err => {
        _readyPromise = null;
        throw err;
      });
    }
    return _readyPromise;
  },

  /* Re-fetch everything (used after login/logout and data changes). */
  reload(){
    _readyPromise = null;
    return DB.ready();
  },

  getCurrentUser(){ return _cache.user; },
  setCurrentUser(user){ _cache.user = user; },

  all(){
    return {
      shops: _cache.shops,
      products: _cache.products,
      reservations: _cache.reservations,
      contactLog: _cache.contactLog,
      users: _cache.users,
      reviews: _cache.reviews,
      nextId: 0
    };
  },

  // ---- shops ----
  getShops(){ return _cache.shops; },
  getShopById(id){ return _cache.shops.find(shop => shop.id === id); },
  getReviews(shopId){
    return _cache.reviews
      .filter(review => review.shopId === shopId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  async addReview(review){
    const created = await MotifyApi.post("/reviews/", review);
    _cache.reviews.unshift(created);
    // The server recalculates the shop's rating, so refresh the shop list.
    _cache.shops = await MotifyApi.get("/shops/");
    return created.id;
  },
  async updateShop(id, patch){
    const shop = await MotifyApi.patch(`/shops/${id}/`, patch);
    return replaceById(_cache.shops, shop);
  },
  async approveShop(id){
    const shop = await MotifyApi.post(`/shops/${id}/approve/`);
    return replaceById(_cache.shops, shop);
  },
  async createShop(patch){
    const shop = await MotifyApi.post("/shops/", patch);
    _cache.shops.push(shop);
    _cache.user = await MotifyApi.get("/auth/me/");
    return shop;
  },

  // ---- products ----
  getProducts(filters = {}){
    let list = _cache.products;
    if(filters.shopId) list = list.filter(product => product.shopId === filters.shopId);
    return list;
  },
  getProductById(id){ return _cache.products.find(product => product.id === id); },
  async addProduct(product){
    const created = await MotifyApi.post("/products/", product);
    _cache.products.push(created);
    return created.id;
  },
  async toggleProductAvailability(id){
    const product = await MotifyApi.post(`/products/${id}/toggle_availability/`);
    return replaceById(_cache.products, product);
  },
  async updateProduct(id, patch){
    const product = await MotifyApi.patch(`/products/${id}/`, patch);
    return replaceById(_cache.products, product);
  },

  // ---- reservations ----
  getReservations(filters = {}){
    let list = _cache.reservations;
    if(filters.riderId) list = list.filter(reservation => reservation.riderId === filters.riderId);
    if(filters.shopId) list = list.filter(reservation => reservation.shopId === filters.shopId);
    return list.slice().sort((a, b) => b.createdAt - a.createdAt);
  },
  async createReservation(reservation){
    const created = await MotifyApi.post("/reservations/", reservation);
    _cache.reservations.unshift(created);
    return created.id;
  },
  async updateReservationStatus(id, status){
    const updated = await MotifyApi.post(`/reservations/${id}/set_status/`, { status });
    return replaceById(_cache.reservations, updated);
  },

  // ---- contact log ----
  async logContact(entry){
    const created = await MotifyApi.post("/contact-log/", entry);
    _cache.contactLog.unshift(created);
    return created.id;
  },
  getContactLog(filters = {}){
    let list = _cache.contactLog;
    if(filters.shopId) list = list.filter(entry => entry.shopId === filters.shopId);
    return list;
  },

  // ---- users ----
  getUsers(){ return _cache.users; },
  getUserById(id){
    if(_cache.user && _cache.user.id === id) return _cache.user;
    return _cache.users.find(user => user.id === id);
  },
  async toggleFavorite(userId, shopId){
    const user = await MotifyApi.post("/auth/favorites/", { shopId });
    _cache.user = user;
    return user;
  },
  async addVehicle(userId, vehicle){
    const user = await MotifyApi.post("/auth/vehicles/", vehicle);
    _cache.user = user;
    return user;
  },
  async suspendUser(userId){
    const user = await MotifyApi.post(`/users/${userId}/toggle_suspend/`);
    return replaceById(_cache.users, user);
  },
  async resetUserPassword(userId){
    const response = await MotifyApi.post(`/users/${userId}/reset_password/`);
    return response.detail;
  },

  // ---- stats ----
  getStats(){
    const shops = _cache.shops;
    const reservations = _cache.reservations;
    const zones = {};
    shops.forEach(shop => {
      const key = shop.zone || "Unassigned";
      zones[key] = zones[key] || { vendors:0, reservations:0 };
      zones[key].vendors++;
    });
    reservations.forEach(reservation => {
      const shop = shops.find(item => item.id === reservation.shopId);
      if(!shop) return;
      const key = shop.zone || "Unassigned";
      zones[key] = zones[key] || { vendors:0, reservations:0 };
      zones[key].reservations++;
    });
    const riderCount = _cache.users.length
      ? _cache.users.filter(user => user.role === "rider").length
      : (_cache.stats?.riderCount || 0);
    return {
      vendorCount: shops.length,
      partsCount: _cache.products.length,
      reservationCount: reservations.length,
      pendingVerification: shops.filter(shop => !shop.verified).length,
      riderCount,
      zones
    };
  },

  // Legacy helper kept so old console snippets / links don't break.
  reset(){
    _readyPromise = null;
    return DB.ready();
  }
};

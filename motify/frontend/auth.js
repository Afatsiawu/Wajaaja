/* =========================================================
  Motify - auth.js
  Token-based authentication against the Django API.

  The session is a DRF token in localStorage; the signed-in user object is
  kept in DB's cache. Pages call `await Auth.requireRole([...])` at the top
  of their script.
  ========================================================= */

const SESSION_KEY = "kmp_session_v1"; // legacy key, cleaned up on logout

const Auth = {
  currentUser(){
    return DB.getCurrentUser();
  },

  /* Ensure the cache is loaded and return the current user (or null). */
  async ready(){
    await DB.ready();
    return DB.getCurrentUser();
  },

  async login(identifier, password){
    const data = await MotifyApi.post("/auth/login/", { identifier, password });
    MotifyApi.setToken(data.token);
    DB.setCurrentUser(data.user);
    await DB.reload();
    return DB.getCurrentUser();
  },

  /* Quick demo access used by the login page's buttons. */
  async loginAs(userId){
    const data = await MotifyApi.post("/auth/demo-login/", { userId });
    MotifyApi.setToken(data.token);
    DB.setCurrentUser(data.user);
    await DB.reload();
    return DB.getCurrentUser();
  },

  async register({ name, phone, email, password, role }){
    const data = await MotifyApi.post("/auth/register/", { name, phone, email, password, role });
    MotifyApi.setToken(data.token);
    DB.setCurrentUser(data.user);
    await DB.reload();
    return DB.getCurrentUser();
  },

  async logout(){
    try{ await MotifyApi.post("/auth/logout/"); }catch(err){ /* token may already be invalid */ }
    MotifyApi.setToken(null);
    DB.setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  },

  async changePassword(currentPassword, newPassword){
    const data = await MotifyApi.post("/auth/change-password/", { currentPassword, newPassword });
    MotifyApi.setToken(data.token);
    DB.setCurrentUser(data.user);
    return data.user;
  },

  /* Call at the top of a protected page. Redirects to login if not
     signed in, or to home if signed in with the wrong role. */
  async requireRole(allowedRoles){
    await DB.ready();
    const user = DB.getCurrentUser();
    if(!user){
      window.location.href = "login.html";
      return null;
    }
    if(allowedRoles && !allowedRoles.includes(user.role)){
      window.location.href = "index.html";
      return null;
    }
    return user;
  }
};

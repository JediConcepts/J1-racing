/* =========================================================================
   MCL-64  —  accounts and leaderboard
   =========================================================================

   Everything here is OPTIONAL at runtime. The Artifact build ships without
   window.MCL64_CLOUD and without the Supabase SDK, because that host's CSP
   blocks every external origin — so init() fails cleanly and the game stays
   a pure offline racer with no account UI at all. Nothing below may ever
   throw into the render loop.

   The publishable key is public by design. What actually protects the data
   is the RLS and revoked grants in supabase/migrations/0001_leaderboard.sql:
   the client can read `leaderboard` and `profiles`, can read `scores` only
   where validated, and cannot touch `runs` at all.
   ========================================================================= */

function Cloud() {
  this.enabled = false;
  this.client = null;
  this.user = null;
  this.profile = null;
  this.status = 'offline';     /* offline | signed-out | pending | signed-in */
  this.message = '';
  this.watchers = [];
}

/* Inspect the callback URL BEFORE the SDK consumes and strips it.
   Auth failures arrive as parameters, not exceptions, so without this a bad
   link is indistinguishable from never having signed in — which is exactly
   how a working signup can look like nothing happened. */
Cloud.prototype.readCallback = function () {
  try {
    var hp = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var sp = new URLSearchParams((location.search || '').replace(/^\?/, ''));
    var desc = hp.get('error_description') || sp.get('error_description');
    var code = hp.get('error') || sp.get('error');
    if (desc || code) {
      var msg = String(desc || code).replace(/\+/g, ' ');
      try { msg = decodeURIComponent(msg); } catch (e) {}
      return { kind: 'error', message: msg };
    }
    if (hp.get('access_token')) return { kind: 'implicit' };
    if (sp.get('code')) return { kind: 'pkce' };
  } catch (e) {}
  return { kind: 'none' };
};

Cloud.prototype.init = function () {
  var cfg = window.MCL64_CLOUD;
  if (!cfg || !cfg.url || !cfg.key) return false;               /* artifact build */
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;

  var self = this;
  this.callback = this.readCallback();
  try {
    this.client = window.supabase.createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /* the magic-link redirect lands back here carrying the session */
        detectSessionInUrl: true,
        /* IMPLICIT, not PKCE, and deliberately so. PKCE returns ?code= which
           must be exchanged using a code_verifier held in the localStorage of
           the browser that ASKED for the link. Mail apps open links in their
           own in-app browser, so that verifier is routinely absent and the
           exchange fails silently — the player is bounced back to a signed-out
           form having done everything right. Implicit returns the tokens in
           the URL fragment, which works from any browser. The fragment is
           never sent to a server and the SDK strips it immediately.
           OAuth (Google/Apple) redirects within the same browser, so it can
           use PKCE later without this problem. */
        flowType: 'implicit'
      }
    });
  } catch (e) {
    return false;
  }

  this.enabled = true;
  this.status = 'signed-out';

  if (this.callback.kind === 'error') {
    /* Single-use links are routinely consumed early by corporate mail
       scanners and link previewers, which reads to the player as "it just
       didn't work". Say so plainly instead. */
    this.message = /expired|invalid/i.test(this.callback.message)
      ? 'That sign-in link was expired or already used. Send a fresh one.'
      : this.callback.message;
  } else if (this.callback.kind === 'pkce') {
    this.message = 'Sign-in link could not complete in this browser. Open the link in the browser you requested it from.';
  }

  this.client.auth.getSession()
    .then(function (r) { self.adopt(r && r.data ? r.data.session : null); })
    .catch(function () {});

  this.client.auth.onAuthStateChange(function (_event, session) {
    self.adopt(session);
  });

  return true;
};

Cloud.prototype.watch = function (fn) { this.watchers.push(fn); };

Cloud.prototype.notify = function () {
  for (var i = 0; i < this.watchers.length; i++) {
    try { this.watchers[i](this); } catch (e) {}
  }
};

Cloud.prototype.adopt = function (session) {
  var self = this;
  var user = session && session.user ? session.user : null;
  this.user = user;

  if (!user) {
    this.profile = null;
    this.status = 'signed-out';
    this.notify();
    return;
  }

  this.status = 'signed-in';
  this.message = '';
  this.notify();

  /* The signup trigger writes the profile, so a fresh account may race the
     first read. One retry covers it without a loop. */
  this.loadProfile().then(function (p) {
    if (p) return;
    setTimeout(function () { self.loadProfile(); }, 1200);
  });
};

Cloud.prototype.loadProfile = function () {
  var self = this;
  if (!this.enabled || !this.user) return Promise.resolve(null);
  return this.client
    .from('profiles')
    .select('user_id,display_name,country_code')
    .eq('user_id', this.user.id)
    .maybeSingle()
    .then(function (r) {
      if (r && r.data) { self.profile = r.data; self.notify(); return r.data; }
      return null;
    })
    .catch(function () { return null; });
};

/* Magic link keeps us out of the password business entirely: Supabase mints
   and verifies the token, and the browser only ever holds the resulting
   session. Adding Google or Apple later is signInWithOAuth on this same
   client — no change to anything below. */
/* MUST stay in step with handle_new_user() in the SQL migration — the server
   derives the real stored value and this only previews it. If the two drift,
   the name shown before signing up is a lie. */
function deriveDisplayName(first, last) {
  first = String(first || '').trim();
  last = String(last || '').trim();
  if (!first) return 'Driver';
  if (!last) return first.slice(0, 24);
  return (first + ' ' + last.charAt(0).toUpperCase() + '.').slice(0, 24);
}

/* Sign-in and sign-up are the SAME Supabase call — shouldCreateUser is the
   only difference. Passing extra === null means "existing accounts only", so
   a typo in the email address cannot quietly mint a second account with no
   driver name attached to it. */
Cloud.prototype.sendLink = function (email, extra) {
  var self = this;
  if (!this.enabled) return Promise.resolve({ ok: false, error: 'Leaderboard unavailable here.' });
  var isSignUp = !!extra;
  extra = extra || {};

  email = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Promise.resolve({ ok: false, error: 'That email does not look right.' });
  }
  if (isSignUp && !String(extra.first || '').trim()) {
    return Promise.resolve({ ok: false, error: 'First name, please.' });
  }
  if (isSignUp && !String(extra.driver || '').trim()) {
    return Promise.resolve({ ok: false, error: 'Pick a driver name for the board.' });
  }

  this.status = 'pending';
  this.message = 'Sending...';
  this.notify();

  /* Supabase does NOT error when this address is missing from the project's
     allow-list — it silently substitutes the dashboard's Site URL, which
     defaults to localhost on a new project. Naming the host in the success
     message turns that invisible substitution into something a player (or
     we) can spot immediately. */
  var redirect = location.origin + location.pathname;

  /* options.data lands in raw_user_meta_data, which handle_new_user() reads
     on signup. It is applied on the FIRST sign-in only, and it is
     client-supplied — fine for a self-chosen label, but worth remembering
     that these names are self-declared, unlike Google's or Apple's. */
  var options = { emailRedirectTo: redirect, shouldCreateUser: isSignUp };
  if (isSignUp) {
    /* Applied on FIRST sign-in only, and client-supplied — fine for a
       self-chosen label, but these names are self-declared, unlike the ones
       Google and Apple will hand us later. */
    options.data = {
      driver_name: String(extra.driver || '').trim(),
      given_name: String(extra.first || '').trim(),
      family_name: String(extra.last || '').trim(),
      marketing_opt_in: !!extra.optIn
    };
  }

  this.pendingEmail = email;

  return this.client.auth.signInWithOtp({ email: email, options: options }).then(function (r) {
    if (r && r.error) {
      self.status = 'signed-out';
      var m = r.error.message || '';
      if (/rate|limit|seconds/i.test(m)) {
        /* the shared Supabase mailer allows only a handful an hour */
        self.message = 'Too many emails just now — try again shortly.';
      } else if (!isSignUp && /signups? not allowed|not found|otp/i.test(m)) {
        /* Supabase deliberately blurs whether an address exists, so this
           cannot say "no such user" outright — point at the way forward. */
        self.message = 'No account found for that email. Create one instead?';
      } else {
        self.message = m || 'Could not send the link.';
      }
      self.notify();
      return { ok: false, error: self.message };
    }
    self.status = 'pending';
    self.message = '';
    self.notify();
    return { ok: true, redirect: redirect };
  }).catch(function (e) {
    self.status = 'signed-out';
    self.message = 'Network error — could not send the link.';
    self.notify();
    return { ok: false, error: String(e) };
  });
};

/* OAuth navigates the page away, so the returned promise usually never
   settles — anything after this call should assume it will not run. The
   session comes back through the same redirect handling as a magic link. */
Cloud.prototype.signInWithProvider = function (provider) {
  var self = this;
  if (!this.enabled) return Promise.resolve({ ok: false });

  this.message = 'Opening ' + provider + '...';
  this.notify();

  return this.client.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: location.origin + location.pathname,
      /* Otherwise a signed-in Google user is bounced straight through with no
         chance to choose which account they want to race under. */
      queryParams: { prompt: 'select_account' }
    }
  }).then(function (r) {
    if (r && r.error) {
      self.status = 'signed-out';
      self.message = r.error.message || 'Could not start Google sign-in.';
      self.notify();
      return { ok: false, error: self.message };
    }
    return { ok: true };
  }).catch(function (e) {
    self.status = 'signed-out';
    self.message = 'Could not reach Google.';
    self.notify();
    return { ok: false, error: String(e) };
  });
};

Cloud.prototype.signIn = function (email) { return this.sendLink(email, null); };
Cloud.prototype.signUp = function (email, extra) { return this.sendLink(email, extra || {}); };

/* Back to the form from the "check your email" state. */
Cloud.prototype.cancelPending = function () {
  this.pendingEmail = '';
  this.status = 'signed-out';
  this.message = '';
  this.notify();
};

/* Server decides. The client mirrors the same rules for instant feedback,
   but the RPC is the authority and the unique index is the guarantee. */
Cloud.prototype.checkDriverName = function (name) {
  name = String(name || '').trim();
  if (name.length < 2) return Promise.resolve({ state: 'short' });
  if (name.length > 24) return Promise.resolve({ state: 'long' });
  if (!/^[A-Za-z0-9 '._-]+$/.test(name)) return Promise.resolve({ state: 'chars' });
  if (!this.enabled) return Promise.resolve({ state: 'unknown' });

  return this.client
    .rpc('driver_name_available', { p_name: name })
    .then(function (r) {
      if (r && r.error) return { state: 'unknown' };
      return { state: r.data ? 'free' : 'taken' };
    })
    .catch(function () { return { state: 'unknown' }; });
};

Cloud.prototype.signOut = function () {
  var self = this;
  if (!this.enabled) return Promise.resolve();
  return this.client.auth.signOut()
    .then(function () { self.adopt(null); })
    .catch(function () { self.adopt(null); });
};

Cloud.prototype.setDisplayName = function (name) {
  var self = this;
  if (!this.enabled || !this.user) return Promise.resolve({ ok: false });
  name = String(name || '').trim().slice(0, 24);
  if (name.length < 2) return Promise.resolve({ ok: false, error: 'Too short.' });
  /* select() so PostgREST returns the row it actually wrote. Without it an
     update matching ZERO rows still comes back 200, and the local copy would
     be updated to a name the database never accepted — which is exactly how
     a rename could look saved until the next sign-in reloaded the truth. */
  return this.client
    .from('profiles')
    .update({ display_name: name })
    .eq('user_id', this.user.id)
    .select('display_name')
    .then(function (r) {
      if (r && r.error) return { ok: false, error: r.error.message };
      if (!r || !r.data || !r.data.length) {
        return { ok: false, error: 'The server did not accept that name.' };
      }
      var saved = r.data[0].display_name;
      if (self.profile) { self.profile.display_name = saved; self.notify(); }
      return { ok: true, name: saved };
    })
    .catch(function (e) { return { ok: false, error: String(e) }; });
};

/* Posts a finished race. There is no user_id parameter by design — the
   function derives it from the verified JWT, so a client cannot attribute a
   time to anyone else. Returns whether it was a personal best and the
   resulting board position. */
Cloud.prototype.submitScore = function (r) {
  if (!this.enabled) return Promise.resolve({ ok: false, reason: 'offline' });
  if (!this.user) return Promise.resolve({ ok: false, reason: 'signed-out' });

  return this.client.rpc('submit_score', {
    p_track_version: r.trackVersion,
    p_sim_version: r.simVersion,
    p_race_ms: Math.round(r.raceMs),
    p_best_lap_ms: Math.round(r.bestLapMs),
    p_finish_position: r.position,
    p_trace_key: r.traceKey || null
  }).then(function (res) {
    if (res && res.error) return { ok: false, reason: res.error.message };
    var row = (res && res.data && res.data[0]) || null;
    return {
      ok: true,
      improved: row ? !!row.improved : false,
      rank: row ? row.board_rank : null,
      bestRaceMs: row ? row.best_race_ms : null
    };
  }).catch(function (e) { return { ok: false, reason: String(e) }; });
};

/* Reads the public projection, which exposes a display name and times and
   nothing else — no user id, no email, no surname. */
Cloud.prototype.leaderboard = function (trackVersion, limit) {
  if (!this.enabled) return Promise.resolve([]);
  return this.client
    .from('leaderboard')
    .select('rank,display_name,country_code,race_ms,best_lap_ms,finish_position')
    .eq('track_version', trackVersion)
    .order('rank', { ascending: true })
    .limit(limit || 20)
    .then(function (r) { return (r && r.data) ? r.data : []; })
    .catch(function () { return []; });
};

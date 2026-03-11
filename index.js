const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cron = require("node-cron");
const { supabase } = require("./lib/dataStore");
const { refreshAlerts, computeDashboardStats } = require("./lib/rules");

const app = express();
app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Landing page                                                       */
/* ------------------------------------------------------------------ */
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aarogya Nigrani API</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.5; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .card { max-width: 820px; padding: 16px 18px; border: 1px solid #e5e7eb; border-radius: 12px; }
      ul { padding-left: 18px; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .muted { color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Aarogya Nigrani backend is running (Supabase)</h1>
      <p class="muted">This server exposes JSON endpoints backed by Supabase PostgreSQL.</p>
      <h2>Quick links</h2>
      <ul>
        <li><a href="/health">/health</a></li>
        <li><a href="/dashboard">/dashboard</a></li>
        <li><a href="/sub-districts">/sub-districts</a></li>
        <li><a href="/facilities">/facilities</a></li>
        <li><a href="/alerts">/alerts</a></li>
        <li><a href="/weekly-trends">/weekly-trends</a></li>
        <li><a href="/indicators">/indicators</a></li>
        <li><a href="/facility-performance">/facility-performance</a></li>
      </ul>
      <h2>Auth</h2>
      <ul>
        <li><code>POST /auth/login</code></li>
        <li><code>POST /auth/register</code></li>
      </ul>
    </div>
  </body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  Auth helpers (Supabase Auth)                                       */
/* ------------------------------------------------------------------ */
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";

const signToken = (user) =>
  jwt.sign({ uid: user.uid, role: user.role, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });

const authMiddleware =
  (roles = []) =>
  (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

/* ------------------------------------------------------------------ */
/*  Auth endpoints                                                     */
/* ------------------------------------------------------------------ */
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Get the profile
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !profile) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const validPassword = await bcrypt.compare(password, profile.password);
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = {
    uid: profile.id,
    email: profile.email,
    role: profile.role || "citizen",
    displayName: profile.display_name || "",
  };

  const token = signToken(user);
  return res.json({ token, user });
});

app.post("/auth/register", async (req, res) => {
  const { email, password, role, displayName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Check existing
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) {
    return res.status(409).json({ error: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      email,
      password: hashedPassword,
      role: role || "citizen",
      display_name: displayName || "",
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const user = {
    uid: profile.id,
    email: profile.email,
    role: profile.role || "citizen",
    displayName: profile.display_name || "",
  };

  const token = signToken(user);
  return res.json({ token, user });
});

/* ------------------------------------------------------------------ */
/*  Utility: map DB rows to JSON API shape                             */
/* ------------------------------------------------------------------ */
const mapSubDistrict = (row) => ({
  id: row.id,
  name: row.name,
  population: row.population,
  riskLevel: row.risk_level,
  coordinates: row.coordinates,
  healthMetrics: row.health_metrics,
});

const mapFacility = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  subDistrictId: row.sub_district_id,
  subDistrictName: row.sub_district_name,
  coordinates: row.coordinates,
  totalBeds: row.total_beds,
  occupiedBeds: row.occupied_beds,
  services: row.services,
  performance: row.performance,
  contact: row.contact,
  medicineStock: row.medicine_stock,
});

const mapAlert = (row) => ({
  id: row.id,
  subDistrictId: row.sub_district_id,
  subDistrictName: row.sub_district_name,
  facilityId: row.facility_id,
  facilityName: row.facility_name,
  type: row.type,
  severity: row.severity,
  message: row.message,
  timestamp: row.created_at,
  disease: row.disease,
  isResolved: row.is_resolved,
});

const mapComplaint = (row) => ({
  id: row.id,
  citizenName: row.citizen_name,
  citizenEmail: row.citizen_email,
  citizenPhone: row.citizen_phone,
  subDistrictId: row.sub_district_id,
  facilityId: row.facility_id,
  category: row.category,
  description: row.description,
  status: row.status,
  priority: row.priority,
  timestamp: row.created_at,
  resolvedAt: row.resolved_at,
  response: row.response,
});

const mapWeeklyTrend = (row) => ({
  week: row.week,
  vectorBorne: row.vector_borne,
  waterBorne: row.water_borne,
});

const mapIndicator = (row) => ({
  indicator: row.indicator,
  currentYear: Number(row.current_year),
  previousYear: Number(row.previous_year),
  percentageChange: Number(row.percentage_change),
  trend: row.trend,
});

const mapPerformance = (row) => ({
  indicator: row.indicator,
  facilityType: row.facility_type,
  totalFacilities: row.total_facilities,
  nilPerformingFacilities: row.nil_performing_facilities,
  maxPerformance: row.max_performance,
  minPerformance: row.min_performance,
});

/* ------------------------------------------------------------------ */
/*  Sub-districts                                                      */
/* ------------------------------------------------------------------ */
app.get("/wards", async (_req, res) => {
  const { data, error } = await supabase.from("sub_districts").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapSubDistrict));
});

app.get("/sub-districts", async (_req, res) => {
  const { data, error } = await supabase.from("sub_districts").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapSubDistrict));
});

app.get("/sub-districts/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("sub_districts")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Not found" });
  res.json(mapSubDistrict(data));
});

/* ------------------------------------------------------------------ */
/*  Facilities                                                         */
/* ------------------------------------------------------------------ */
app.get("/facilities", async (_req, res) => {
  const { data, error } = await supabase.from("facilities").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapFacility));
});

app.get("/facilities/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "Not found" });
  res.json(mapFacility(data));
});

app.post(
  "/facilities/:id",
  authMiddleware(["admin", "staff"]),
  async (req, res) => {
    // Map camelCase to snake_case for DB update
    const updates = {};
    const body = req.body;
    if (body.totalBeds !== undefined) updates.total_beds = body.totalBeds;
    if (body.occupiedBeds !== undefined)
      updates.occupied_beds = body.occupiedBeds;
    if (body.services !== undefined) updates.services = body.services;
    if (body.performance !== undefined) updates.performance = body.performance;
    if (body.contact !== undefined) updates.contact = body.contact;
    if (body.medicineStock !== undefined)
      updates.medicine_stock = body.medicineStock;
    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) updates.type = body.type;

    const { data, error } = await supabase
      .from("facilities")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(404).json({ error: "Not found" });
    res.json(mapFacility(data));
  },
);

/* ------------------------------------------------------------------ */
/*  Indicators                                                         */
/* ------------------------------------------------------------------ */
app.get("/indicators", async (_req, res) => {
  const { data, error } = await supabase.from("indicators").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapIndicator));
});

/* ------------------------------------------------------------------ */
/*  Weekly Trends                                                      */
/* ------------------------------------------------------------------ */
app.get("/weekly-trends", async (_req, res) => {
  const { data, error } = await supabase
    .from("weekly_trends")
    .select("*")
    .order("id", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapWeeklyTrend));
});

/* ------------------------------------------------------------------ */
/*  Facility Performance                                               */
/* ------------------------------------------------------------------ */
app.get("/facility-performance", async (_req, res) => {
  const { data, error } = await supabase
    .from("facility_performance")
    .select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapPerformance));
});

/* ------------------------------------------------------------------ */
/*  Alerts                                                             */
/* ------------------------------------------------------------------ */
app.get("/alerts", async (_req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapAlert));
});

app.get("/alerts/active", async (_req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("is_resolved", false)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(mapAlert));
});

app.post(
  "/alerts/resolve/:id",
  authMiddleware(["admin", "staff"]),
  async (req, res) => {
    const { error } = await supabase
      .from("alerts")
      .update({ is_resolved: true })
      .eq("id", req.params.id);
    if (error) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  },
);

/* ------------------------------------------------------------------ */
/*  Complaints                                                         */
/* ------------------------------------------------------------------ */
app.get(
  "/complaints",
  authMiddleware(["admin", "staff"]),
  async (_req, res) => {
    const { data, error } = await supabase
      .from("complaints")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data.map(mapComplaint));
  },
);

app.post("/complaints", async (req, res) => {
  const body = req.body;
  const row = {
    citizen_name: body.citizenName,
    citizen_email: body.citizenEmail || null,
    citizen_phone: body.citizenPhone || null,
    sub_district_id: body.subDistrictId,
    facility_id: body.facilityId || null,
    category: body.category,
    description: body.description,
    priority: body.priority || "medium",
  };

  const { data, error } = await supabase
    .from("complaints")
    .insert(row)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(mapComplaint(data));
});

app.post(
  "/complaints/:id/status",
  authMiddleware(["admin", "staff"]),
  async (req, res) => {
    const { status, response } = req.body;
    const updates = { status };
    if (response) updates.response = response;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("complaints")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(404).json({ error: "Not found" });
    res.json(mapComplaint(data));
  },
);

/* ------------------------------------------------------------------ */
/*  Appointments                                                       */
/* ------------------------------------------------------------------ */
app.get(
  "/appointments",
  authMiddleware(["admin", "staff"]),
  async (_req, res) => {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(
      data.map((row) => ({
        id: row.id,
        citizenName: row.citizen_name,
        citizenPhone: row.citizen_phone,
        subDistrictId: row.sub_district_id,
        facilityId: row.facility_id,
        preferredDate: row.preferred_date,
        reason: row.reason,
        status: row.status,
        timestamp: row.created_at,
      })),
    );
  },
);

app.post("/appointments", async (req, res) => {
  const body = req.body;
  const row = {
    citizen_name: body.citizenName,
    citizen_phone: body.citizenPhone || null,
    sub_district_id: body.subDistrictId,
    facility_id: body.facilityId || null,
    preferred_date: body.preferredDate || null,
    reason: body.reason,
  };

  const { data, error } = await supabase
    .from("appointments")
    .insert(row)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    id: data.id,
    citizenName: data.citizen_name,
    citizenPhone: data.citizen_phone,
    subDistrictId: data.sub_district_id,
    facilityId: data.facility_id,
    preferredDate: data.preferred_date,
    reason: data.reason,
    status: data.status,
    timestamp: data.created_at,
  });
});

/* ------------------------------------------------------------------ */
/*  Dashboard (aggregated)                                             */
/* ------------------------------------------------------------------ */
app.get("/dashboard", async (_req, res) => {
  const [sdRes, facRes, wtRes, alertRes, indRes, perfRes] = await Promise.all([
    supabase.from("sub_districts").select("*"),
    supabase.from("facilities").select("*"),
    supabase.from("weekly_trends").select("*").order("id", { ascending: true }),
    supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("indicators").select("*"),
    supabase.from("facility_performance").select("*"),
  ]);

  if (sdRes.error || facRes.error || wtRes.error) {
    return res.status(500).json({ error: "Failed to load dashboard data" });
  }

  const subDistricts = sdRes.data.map(mapSubDistrict);
  const facilities = facRes.data.map(mapFacility);
  const weeklyTrends = wtRes.data.map(mapWeeklyTrend);
  const alerts = alertRes.data ? alertRes.data.map(mapAlert) : [];
  const indicators = indRes.data ? indRes.data.map(mapIndicator) : [];
  const performance = perfRes.data ? perfRes.data.map(mapPerformance) : [];

  const stats = computeDashboardStats(subDistricts, facilities, weeklyTrends);

  res.json({
    stats,
    subDistricts,
    facilities,
    alerts,
    weeklyTrends,
    indicators,
    performance,
  });
});

/* ------------------------------------------------------------------ */
/*  Alert refresh cron (recomputes alerts from current data)           */
/* ------------------------------------------------------------------ */
const refreshJob = async () => {
  try {
    const [sdRes, facRes, wtRes] = await Promise.all([
      supabase.from("sub_districts").select("*"),
      supabase.from("facilities").select("*"),
      supabase
        .from("weekly_trends")
        .select("*")
        .order("id", { ascending: true }),
    ]);

    if (sdRes.error || facRes.error || wtRes.error) {
      console.error("Failed to refresh alerts: data fetch error");
      return;
    }

    const subDistricts = sdRes.data.map(mapSubDistrict);
    const facilities = facRes.data.map(mapFacility);
    const weeklyTrends = wtRes.data.map(mapWeeklyTrend);

    const alerts = refreshAlerts({ weeklyTrends, subDistricts, facilities });

    // Clear old auto-generated alerts and insert fresh ones
    await supabase
      .from("alerts")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (alerts.length > 0) {
      const rows = alerts.map((a) => ({
        sub_district_id: a.subDistrictId,
        sub_district_name: a.subDistrictName,
        facility_id: a.facilityId || null,
        facility_name: a.facilityName || null,
        type: a.type,
        severity: a.severity,
        message: a.message,
        disease: a.disease || null,
        is_resolved: a.isResolved,
        created_at: a.timestamp,
      }));
      await supabase.from("alerts").insert(rows);
    }

    console.log(`Refreshed ${alerts.length} alerts`);
  } catch (err) {
    console.error("Alert refresh error:", err);
  }
};

cron.schedule("*/30 * * * *", refreshJob);

/* ------------------------------------------------------------------ */
/*  Server startup                                                     */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  // Seed default users if none exist
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);
  if (!profiles || profiles.length === 0) {
    console.log("Seeding default users...");
    const hashedPassword = await bcrypt.hash("password", 10);
    const defaultUsers = [
      { email: "admin@smc.in", password: hashedPassword, role: "admin" },
      { email: "staff@hospital.in", password: hashedPassword, role: "staff" },
      {
        email: "citizen@example.com",
        password: hashedPassword,
        role: "citizen",
      },
    ];
    for (const u of defaultUsers) {
      const { error } = await supabase.from("profiles").insert({
        email: u.email,
        password: u.password,
        role: u.role,
        display_name: "",
      });
      if (error) console.warn(`  Skipping ${u.email}: ${error.message}`);
      else console.log(`  Created ${u.email} (${u.role})`);
    }
  }

  console.log(
    `Aarogya Nigrani server running on http://localhost:${PORT} (Supabase)`,
  );
});

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  ActivateRescueSosBody,
  ActivateRescueSosResponse,
  CreateRescueRequestBody,
  CreateRescueRequestResponse,
  GetRescueOverviewResponse,
  GetRescueRequestParams,
  GetRescueRequestResponse,
  ListRescueRespondersResponse,
  ListRescueRequestsResponse,
  MatchRespondersBody,
  MatchRespondersResponse,
  ReplanRescueBody,
  ReplanRescueParams,
  ReplanRescueResponse,
  TriageRescueBody,
  TriageRescueResponse,
  UpdateRescueStatusBody,
  UpdateRescueStatusParams,
  UpdateRescueStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  rescueRequestsTable,
  rescueSosEventsTable,
} from "@workspace/db";

const router: IRouter = Router();
const SESSION_COOKIE = "road_resq_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

router.use((req, res, next) => {
  const userId = getAuth(req).userId;
  const existingSessionId = req.signedCookies?.[SESSION_COOKIE];
  const sessionId =
    userId
      ? `clerk:${userId}`
      : typeof existingSessionId === "string" && existingSessionId.length > 0
      ? existingSessionId
      : randomUUID();

  if (!userId && (!existingSessionId || typeof existingSessionId !== "string")) {
    res.cookie(SESSION_COOKIE, sessionId, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/api/road-resq",
    });
  }

  res.locals.roadResqSessionId = sessionId;
  next();
});

const demoResponders = [
  {
    id: "demo-engine-01",
    name: "Aarav S.",
    specialty: "Engine & diagnostics",
    rating: 4.8,
    completedRescues: 412,
    experienceYears: 9,
    etaMinutes: 11,
    distanceKm: 4.2,
    verified: true,
    nightAvailable: true,
    femaleResponder: false,
    serviceCenter: true,
    available: true,
    reliability: 96,
    supportedVehicles: ["Car", "SUV"],
    tools: ["OBD-II scanner", "Jump starter", "Thermal scanner"],
    latitude: 12.9662,
    longitude: 77.6951,
    priceMin: 450,
    priceMax: 950,
  },
  {
    id: "demo-tyre-02",
    name: "Nisha R.",
    specialty: "Tyre & wheel repair",
    rating: 4.9,
    completedRescues: 286,
    experienceYears: 7,
    etaMinutes: 9,
    distanceKm: 3.4,
    verified: true,
    nightAvailable: true,
    femaleResponder: true,
    serviceCenter: false,
    available: true,
    reliability: 98,
    supportedVehicles: ["Car", "SUV", "Motorcycle"],
    tools: ["Hydraulic jack", "Air compressor", "Tyre repair kit"],
    latitude: 12.9519,
    longitude: 77.7102,
    priceMin: 350,
    priceMax: 700,
  },
  {
    id: "demo-ev-03",
    name: "Devika M.",
    specialty: "Battery, electrical & EV",
    rating: 4.8,
    completedRescues: 331,
    experienceYears: 8,
    etaMinutes: 13,
    distanceKm: 5.8,
    verified: true,
    nightAvailable: true,
    femaleResponder: true,
    serviceCenter: true,
    available: true,
    reliability: 95,
    supportedVehicles: ["Car", "SUV", "EV"],
    tools: ["EV-safe kit", "Battery tester", "Portable charger"],
    latitude: 12.9764,
    longitude: 77.7205,
    priceMin: 500,
    priceMax: 1400,
  },
  {
    id: "demo-tow-04",
    name: "City Recovery",
    specialty: "Towing & accident recovery",
    rating: 4.7,
    completedRescues: 538,
    experienceYears: 12,
    etaMinutes: 17,
    distanceKm: 7.6,
    verified: true,
    nightAvailable: true,
    femaleResponder: false,
    serviceCenter: true,
    available: true,
    reliability: 93,
    supportedVehicles: ["Car", "SUV", "EV"],
    tools: ["Flatbed tow truck", "Wheel lift", "Safety cones"],
    latitude: 12.9377,
    longitude: 77.6774,
    priceMin: 1200,
    priceMax: 3200,
  },
] as const;

type IssueType = NonNullable<
  ReturnType<typeof TriageRescueBody.parse>["issueType"]
>;

const issueDetails: Record<
  IssueType,
  {
    probableIssue: string;
    responderType: string;
    priority: "low" | "medium" | "high" | "critical";
    confidence: number;
    questions: string[];
    priceMin: number;
    priceMax: number;
  }
> = {
  flat_tire: {
    probableIssue: "Possible flat or damaged tyre",
    responderType: "Tyre specialist",
    priority: "medium",
    confidence: 76,
    questions: ["Is the vehicle fully off the road?", "Do you have a spare tyre?"],
    priceMin: 350,
    priceMax: 700,
  },
  battery: {
    probableIssue: "Possible battery or starting-system issue",
    responderType: "Battery and electrical specialist",
    priority: "medium",
    confidence: 72,
    questions: ["Do the dashboard lights turn on?", "Can you hear a clicking sound?"],
    priceMin: 300,
    priceMax: 800,
  },
  fuel: {
    probableIssue: "Possible fuel shortage",
    responderType: "Fuel assistance responder",
    priority: "medium",
    confidence: 73,
    questions: ["What fuel type does your vehicle use?", "Are you in a safe place to wait?"],
    priceMin: 400,
    priceMax: 900,
  },
  overheating: {
    probableIssue: "Possible engine overheating",
    responderType: "Engine specialist",
    priority: "high",
    confidence: 74,
    questions: ["Is the temperature warning light on?", "Is there smoke or steam?"],
    priceMin: 450,
    priceMax: 1000,
  },
  ev_battery: {
    probableIssue: "Possible EV battery depletion",
    responderType: "EV charging and recovery specialist",
    priority: "high",
    confidence: 70,
    questions: ["What range does the vehicle display?", "Is the charging port accessible?"],
    priceMin: 800,
    priceMax: 1800,
  },
  accident: {
    probableIssue: "Possible collision damage",
    responderType: "Recovery specialist",
    priority: "critical",
    confidence: 77,
    questions: ["Is anyone injured?", "Is the vehicle away from moving traffic?"],
    priceMin: 900,
    priceMax: 2600,
  },
  mechanical: {
    probableIssue: "Possible mechanical failure",
    responderType: "General mechanic",
    priority: "medium",
    confidence: 60,
    questions: ["What changed just before the vehicle stopped?", "Are any warning lights on?"],
    priceMin: 500,
    priceMax: 1400,
  },
  medical: {
    probableIssue: "Medical emergency reported",
    responderType: "Emergency escalation",
    priority: "critical",
    confidence: 82,
    questions: ["Can a passenger call local emergency services now?", "Are you in a safe place?"],
    priceMin: 0,
    priceMax: 0,
  },
  towing: {
    probableIssue: "Vehicle may need towing",
    responderType: "Towing and recovery provider",
    priority: "high",
    confidence: 74,
    questions: ["Can the vehicle roll safely?", "Is it an EV or an all-wheel-drive vehicle?"],
    priceMin: 1200,
    priceMax: 3200,
  },
  other: {
    probableIssue: "Roadside issue needs responder assessment",
    responderType: "General roadside responder",
    priority: "medium",
    confidence: 48,
    questions: ["Is anyone injured?", "Is the vehicle safely away from traffic?"],
    priceMin: 400,
    priceMax: 1200,
  },
};

function inferIssue(description: string): IssueType {
  const text = description.toLocaleLowerCase();
  if (/medical|injur|hurt|ambulance|heart attack|बेहोश|चोट|गंभीर|వైద్య|గాయం|அவசர மருத்துவம்|තුව傷/i.test(text)) {
    return "medical";
  }
  if (/accident|collision|crash|crashed|hit by|टक्कर|दुर्घटना|ప్రమాదం|விபத்து|ಅಪಘಾತ|അപകടം|দুর্ঘটনা/i.test(text)) {
    return "accident";
  }
  if (/smoke|steam|overheat|temperature|hot engine|white smoke|धुआं|गर्म इंजन|పొగ|వేడెక్క|புகை|சூடாக|ಹೊಗೆ|ಅತಿಯಾಗಿ ಬಿಸಿ|പുക|ചൂട്|ধোঁয়া/i.test(text)) {
    return "overheating";
  }
  if (/tow|towing|breakdown truck|recover my car|टोइंग|टो करें|తీసుకెళ్ల|இழுவை|ಟೋ|വലിച്ചുകൊണ്ടുപോ|টানার/i.test(text)) {
    return "towing";
  }
  if (/ev |electric vehicle|electric car|charging|charge is empty|no range|ईवी|इलेक्ट्रिक कार|चार्ज खत्म|ఎలక్ట్రిక్|చార్జింగ్|மின்சார வாகனம்|சார்ஜ் காலி|ವಿದ್ಯುತ್ ವಾಹನ|ചാർജ് തീർന്നു|ইলেকট্রিক গাড়ি/i.test(text)) {
    return "ev_battery";
  }
  if (/fuel|petrol|diesel|empty tank|out of gas|ran out of|ईंधन|पेट्रोल|डीजल|ఇంధనం|పెట్రోల్|எரிபொருள்|பெட்ரோல்|ಇಂಧನ|പെട്രോൾ|জ্বালানি/i.test(text)) {
    return "fuel";
  }
  if (/flat tyre|flat tire|puncture|punctured|tyre|tire|wheel|टायर|पंक्चर|టైర్|పంచర్|டயர்|பஞ்சர்|ಟೈರ್|ಪಂಚರ್|പഞ്ചർ|ടയർ|টায়ার|পাংচার/i.test(text)) {
    return "flat_tire";
  }
  if (/battery|won't start|will not start|not starting|dead car|clicking|jump start|बैटरी|स्टार्ट नहीं|బ్యాటరీ|స్టార్ట్ కావడం లేదు|பேட்டரி|தொடங்கவில்லை|ಬ್ಯಾಟರಿ|ಸ್ಟಾರ್ಟ್ ಆಗುತ್ತಿಲ್ಲ|ബാറ്ററി|স্টার্ট নিচ্ছে না/i.test(text)) {
    return "battery";
  }
  if (/gearbox|engine|clutch|brake|steering|mechanic|engine stopped|इंजन|क्लच|తప్పు|ఇంజిన్|என்ஜின்|கிளட்ச்|ಎಂಜಿನ್|എഞ്ചിൻ|ইঞ্জিন/i.test(text)) {
    return "mechanical";
  }
  return "other";
}

function guidanceFor(issueType: IssueType, imageAttached: boolean): string[] {
  const guidance: string[] = [];
  if (issueType === "medical" || issueType === "accident") {
    guidance.push("If someone may be injured, call local emergency services directly now.");
  }
  if (issueType === "overheating") {
    guidance.push("If it is safe, switch off the engine. Do not open a hot radiator cap.");
  }
  if (issueType === "flat_tire" || issueType === "accident") {
    guidance.push("Stay behind a barrier, away from traffic, if you can reach one safely.");
  } else {
    guidance.push("Move as far from moving traffic as you safely can; use hazard lights if safe.");
  }
  if (imageAttached) {
    guidance.push("The photo was selected only in this browser; it was not uploaded or analyzed in this demo.");
  }
  return guidance;
}

function issueMatch(responder: string, issueType: IssueType): boolean {
  const specialty = responder.toLocaleLowerCase();
  switch (issueType) {
    case "flat_tire":
      return /tyre|tire|wheel/.test(specialty);
    case "battery":
      return /battery|electrical|engine/.test(specialty);
    case "fuel":
      return /fuel|general|engine/.test(specialty);
    case "overheating":
      return /engine|diagnostic/.test(specialty);
    case "ev_battery":
      return /ev|electrical|recovery/.test(specialty);
    case "accident":
      return /recovery|tow/.test(specialty);
    case "medical":
      return false;
    case "towing":
      return /tow|recovery/.test(specialty);
    case "mechanical":
      return /engine|diagnostic|battery/.test(specialty);
    case "other":
      return /engine|recovery|battery/.test(specialty);
  }
}

function distanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(toLatitude - fromLatitude);
  const dLon = radians(toLongitude - fromLongitude);
  const lat1 = radians(fromLatitude);
  const lat2 = radians(toLatitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function rankedMatches(input: ReturnType<typeof MatchRespondersBody.parse>) {
  return demoResponders
    .filter((responder) => responder.available)
    .filter((responder) => !input.verifiedOnly || responder.verified)
    .filter((responder) => !input.nightService || responder.nightAvailable)
    .filter((responder) => issueMatch(responder.specialty, input.issueType))
    .map((responder) => {
      const distance = distanceKm(
        input.latitude,
        input.longitude,
        responder.latitude,
        responder.longitude,
      );
      const eta = Math.max(6, Math.min(120, Math.round(distance * 2.6) + 4));
      const matchedExpertise = issueMatch(responder.specialty, input.issueType);
      const vehicleCompatible =
        !input.vehicleType ||
        responder.supportedVehicles.some(
          (vehicle) => vehicle.toLowerCase() === input.vehicleType?.toLowerCase(),
        );
      const preferencePoints =
        (input.femaleResponderPreference && responder.femaleResponder ? 11 : 0) +
        (input.serviceCenterPreference && responder.serviceCenter ? 8 : 0) +
        (input.nightService && responder.nightAvailable ? 8 : 0);
      const suitabilityScore = Math.max(
        1,
        Math.min(
          99,
          Math.round(
            20 +
              (matchedExpertise ? 27 : 0) +
              (responder.verified ? 10 : 0) +
              responder.rating * 5 +
              responder.reliability * 0.12 +
              Math.max(0, 14 - eta * 0.6) +
              Math.max(0, 12 - distance * 0.45) +
              (vehicleCompatible ? 7 : 0) +
              preferencePoints,
          ),
        ),
      );
      const base = issueDetails[input.issueType];
      const nightFee = input.nightService ? 100 : 0;
      return {
        id: responder.id,
        name: responder.name,
        specialty: responder.specialty,
        rating: responder.rating,
        completedRescues: responder.completedRescues,
        experienceYears: responder.experienceYears,
        etaMinutes: eta,
        distanceKm: distance,
        verified: responder.verified,
        nightAvailable: responder.nightAvailable,
        femaleResponder: responder.femaleResponder,
        serviceCenter: responder.serviceCenter,
        available: responder.available,
        reliability: responder.reliability,
        supportedVehicles: [...responder.supportedVehicles],
        tools: [...responder.tools],
        suitabilityScore,
        matchedExpertise,
        priceMin: Math.max(0, base.priceMin + nightFee),
        priceMax: Math.max(0, base.priceMax + nightFee),
      };
    })
    .sort((first, second) => second.suitabilityScore - first.suitabilityScore);
}

function sessionId(res: Response): string {
  return res.locals.roadResqSessionId as string;
}

function apiRequest(row: typeof rescueRequestsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt,
  };
}

router.get("/road-resq/overview", async (_req, res): Promise<void> => {
  const records = await db
    .select()
    .from(rescueRequestsTable)
    .where(eq(rescueRequestsTable.sessionId, sessionId(res)));
  const active = records.filter(
    (request) => !["resolved", "cancelled"].includes(request.status),
  );
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = records.filter(
    (request) =>
      request.status === "resolved" &&
      request.createdAt.toISOString().slice(0, 10) === today,
  ).length;
  const recentRequests = records
    .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
    .slice(0, 5)
    .map(apiRequest);

  const response = {
    activeRequests: active.length,
    completedToday,
    verifiedResponders: demoResponders.filter((responder) => responder.verified).length,
    averageEta: active.length
      ? Math.round(active.reduce((sum, request) => sum + request.etaMinutes, 0) / active.length)
      : 9,
    recentRequests,
  };
  res.json(GetRescueOverviewResponse.parse(response));
});

router.get("/road-resq/responders", (_req, res): void => {
  const response = demoResponders.map(
    ({ latitude: _latitude, longitude: _longitude, priceMin: _priceMin, priceMax: _priceMax, ...responder }) =>
      responder,
  );
  res.json(ListRescueRespondersResponse.parse(response));
});

router.post("/road-resq/triage", (req, res): void => {
  const parsed = TriageRescueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const issueType = input.issueType ?? inferIssue(input.description);
  const issue = issueDetails[issueType];
  const alarming =
    /smoke|fire|flame|injur|hurt|collision|crash|burning|धुआं|आग|चोट|పొగ|మంట|గాయం|புகை|தீ|காயம்/i.test(
      input.description,
    );
  const priority =
    issueType === "medical" || issueType === "accident"
      ? "critical"
      : alarming || issue.priority === "critical"
        ? "high"
        : issue.priority;
  const riskScore = Math.max(
    14,
    Math.min(
      97,
      26 +
        (input.night ? 20 : 0) +
        (input.weakNetwork ? 14 : 0) +
        (priority === "critical" ? 27 : priority === "high" ? 18 : 0),
    ),
  );
  const response = {
    issueType,
    probableIssue: issue.probableIssue,
    responderType: issue.responderType,
    priority,
    confidence: issue.confidence,
    riskScore,
    questions: issue.questions,
    safetyGuidance: guidanceFor(issueType, input.imageAttached),
    priceMin: issue.priceMin + (input.night ? 100 : 0),
    priceMax: issue.priceMax + (input.night ? 100 : 0),
    mode: "Rules-based demo • no live AI model connected",
  };
  res.json(TriageRescueResponse.parse(response));
});

router.post("/road-resq/matches", (req, res): void => {
  const parsed = MatchRespondersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(MatchRespondersResponse.parse(rankedMatches(parsed.data)));
});

router.get("/road-resq/requests", async (_req, res): Promise<void> => {
  const records = await db
    .select()
    .from(rescueRequestsTable)
    .where(eq(rescueRequestsTable.sessionId, sessionId(res)))
    .orderBy(desc(rescueRequestsTable.createdAt));
  res.json(ListRescueRequestsResponse.parse(records.map(apiRequest)));
});

router.post("/road-resq/requests", async (req, res): Promise<void> => {
  const parsed = CreateRescueRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const responder = demoResponders.find(
    (candidate) => candidate.id === input.responderId && candidate.verified && candidate.available,
  );
  if (!responder) {
    res.status(400).json({ error: "Choose an available verified responder." });
    return;
  }

  const rankedResponder = rankedMatches({
    issueType: input.issueType,
    latitude: input.latitude,
    longitude: input.longitude,
    safeMode: input.safeMode,
    verifiedOnly: true,
    femaleResponderPreference: false,
    serviceCenterPreference: false,
    nightService: false,
    weakNetwork: false,
    vehicleType: input.vehicleType,
  }).find((candidate) => candidate.id === responder.id);
  if (!rankedResponder) {
    res.status(400).json({ error: "That responder is not available for this demo request." });
    return;
  }

  const [record] = await db
    .insert(rescueRequestsTable)
    .values({
      ...input,
      sessionId: sessionId(res),
      status: "responder_assigned",
      responderName: responder.name,
      responderSpecialty: responder.specialty,
      etaMinutes: rankedResponder.etaMinutes,
      distanceKm: rankedResponder.distanceKm,
    })
    .returning();
  res.status(201).json(CreateRescueRequestResponse.parse(apiRequest(record)));
});

router.get("/road-resq/requests/:id", async (req, res): Promise<void> => {
  const parsed = GetRescueRequestParams.safeParse({ id: String(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [record] = await db
    .select()
    .from(rescueRequestsTable)
    .where(
      and(
        eq(rescueRequestsTable.id, parsed.data.id),
        eq(rescueRequestsTable.sessionId, sessionId(res)),
      ),
    );
  if (!record) {
    res.status(404).json({ error: "Rescue request not found." });
    return;
  }
  res.json(GetRescueRequestResponse.parse(apiRequest(record)));
});

router.patch("/road-resq/requests/:id/status", async (req, res): Promise<void> => {
  const params = UpdateRescueStatusParams.safeParse({ id: String(req.params.id) });
  const body = UpdateRescueStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [record] = await db
    .update(rescueRequestsTable)
    .set({ status: body.data.status })
    .where(
      and(
        eq(rescueRequestsTable.id, params.data.id),
        eq(rescueRequestsTable.sessionId, sessionId(res)),
      ),
    )
    .returning();
  if (!record) {
    res.status(404).json({ error: "Rescue request not found." });
    return;
  }
  res.json(UpdateRescueStatusResponse.parse(apiRequest(record)));
});

router.post("/road-resq/requests/:id/replan", async (req, res): Promise<void> => {
  const params = ReplanRescueParams.safeParse({ id: String(req.params.id) });
  const body = ReplanRescueBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(rescueRequestsTable)
    .where(
      and(
        eq(rescueRequestsTable.id, params.data.id),
        eq(rescueRequestsTable.sessionId, sessionId(res)),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Rescue request not found." });
    return;
  }
  const [record] = await db
    .update(rescueRequestsTable)
    .set({
      issueType: "towing",
      probableIssue: "Roadside repair was unsuccessful; towing is being arranged",
      status: "towing_requested",
      responderId: "demo-tow-04",
      responderName: "City Recovery",
      responderSpecialty: "Towing & accident recovery",
      etaMinutes: 18,
      distanceKm: Math.max(4, Math.round(existing.distanceKm * 1.4 * 10) / 10),
      priceMin: Math.max(existing.priceMin, 1200),
      priceMax: Math.max(existing.priceMax, 3200),
      replanCount: existing.replanCount + 1,
      replanNote: body.data.note ?? "Roadside repair could not safely resolve the issue.",
    })
    .where(
      and(
        eq(rescueRequestsTable.id, params.data.id),
        eq(rescueRequestsTable.sessionId, sessionId(res)),
      ),
    )
    .returning();
  res.json(ReplanRescueResponse.parse(apiRequest(record)));
});

router.post("/road-resq/sos", async (req, res): Promise<void> => {
  const parsed = ActivateRescueSosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (input.rescueId) {
    const [request] = await db
      .select({ id: rescueRequestsTable.id })
      .from(rescueRequestsTable)
      .where(
        and(
          eq(rescueRequestsTable.id, input.rescueId),
          eq(rescueRequestsTable.sessionId, sessionId(res)),
        ),
      );
    if (!request) {
      res.status(404).json({ error: "Rescue request not found." });
      return;
    }
  }
  const [event] = await db
    .insert(rescueSosEventsTable)
    .values({
      sessionId: sessionId(res),
      rescueId: input.rescueId ?? null,
      emergencyType: input.emergencyType,
      latitude: input.latitude,
      longitude: input.longitude,
      area: input.area,
      trustedContactSharing: input.trustedContactSharing,
      emergencyServicesContacted: false,
    })
    .returning();
  const contactNotice = input.trustedContactSharing
    ? "SOS recorded in the demo. Trusted-contact sharing is simulated; no message was sent."
    : "SOS recorded in the demo. No trusted contact or emergency service was contacted.";
  res.status(201).json(
    ActivateRescueSosResponse.parse({
      id: event.id,
      rescueId: event.rescueId,
      emergencyType: event.emergencyType,
      area: event.area,
      contactNotice,
      emergencyServicesContacted: false,
      createdAt: event.createdAt,
    }),
  );
});

export default router;

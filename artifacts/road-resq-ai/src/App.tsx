import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetRescueOverviewQueryKey, getListRescueRespondersQueryKey, getListRescueRequestsQueryKey,
  getGetRescueRequestQueryKey, useGetRescueOverview, useListRescueResponders,
  useTriageRescue, useMatchResponders, useListRescueRequests, useCreateRescueRequest,
  useGetRescueRequest, useUpdateRescueStatus, useReplanRescue, useActivateRescueSos,
} from '@workspace/api-client-react';
import type { RescueIssueType, RescueRequest, RescueStatus, RescueTriage, ResponderMatch } from '@workspace/api-client-react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BadgeCheck, Battery, ChevronRight, CircleHelp,
  Clock3, Compass, Fuel, LocateFixed, MapPin, Menu, Mic, Navigation, Phone, Radio, Shield, ShieldCheck,
  Siren, Truck, Wrench, X, Check, ClipboardList, CarFront, CircleDot, Route, Upload,
} from 'lucide-react';
import { Link, Route as WRoute, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#203d49',
    colorForeground: '#203d49',
    colorMutedForeground: '#53655d',
    colorDanger: '#a83e30',
    colorBackground: '#fbfaf5',
    colorInput: '#fffefa',
    colorInputForeground: '#233d47',
    colorNeutral: '#b8b9ad',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf5] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e5e1d6]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203d49] font-semibold',
    headerSubtitle: 'text-[#53655d]',
    socialButtonsBlockButtonText: 'text-[#203d49] font-semibold',
    formFieldLabel: 'text-[#31464a] font-semibold',
    footerActionLink: 'text-[#355c56] font-semibold',
    footerActionText: 'text-[#53655d]',
    dividerText: 'text-[#53655d]',
    identityPreviewEditButton: 'text-[#355c56]',
    formFieldSuccessText: 'text-[#396d52]',
    alertText: 'text-[#874537]',
    logoBox: 'mb-2',
    logoImage: 'max-h-10',
    socialButtonsBlockButton: 'border-[#dcd9cf] bg-[#fffefa]',
    formButtonPrimary: 'bg-[#203d49] text-[#f8f4e9] hover:bg-[#2c5360]',
    formFieldInput: 'border-[#dcd9cf] bg-[#fffefa] text-[#233d47]',
    footerAction: 'text-[#53655d]',
    dividerLine: 'bg-[#dedbd0]',
    alert: 'border-[#ead0c5] bg-[#f7e9e2]',
    otpCodeFieldInput: 'border-[#dcd9cf] bg-[#fffefa] text-[#203d49]',
    formFieldRow: 'text-[#203d49]',
    main: 'text-[#203d49]',
  },
};
const issueOptions: { value: RescueIssueType | 'auto'; label: string }[] = [
  { value: 'auto', label: 'I’m not sure — help me identify it' },
  { value: 'flat_tire', label: 'Flat tire' }, { value: 'battery', label: 'Dead battery' },
  { value: 'fuel', label: 'Out of fuel' }, { value: 'overheating', label: 'Engine overheating' },
  { value: 'ev_battery', label: 'EV battery' }, { value: 'accident', label: 'Collision' },
  { value: 'mechanical', label: 'Mechanical issue' }, { value: 'medical', label: 'Medical concern' },
  { value: 'towing', label: 'Need a tow' }, { value: 'other', label: 'Something else' },
];
const statusNames: Record<string, string> = {
  requested: 'Request received', responder_assigned: 'Responder assigned', en_route: 'On the way',
  arrived: 'Responder arrived', repair_in_progress: 'Repair in progress', towing_requested: 'Tow requested',
  resolved: 'Resolved', cancelled: 'Cancelled',
};

type DemoRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: Event) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => DemoRecognition;
  webkitSpeechRecognition?: new () => DemoRecognition;
};
const voiceLanguages = [
  ['en-IN', 'English'], ['hi-IN', 'Hindi'], ['te-IN', 'Telugu'], ['ta-IN', 'Tamil'],
  ['kn-IN', 'Kannada'], ['ml-IN', 'Malayalam'], ['mr-IN', 'Marathi'], ['bn-IN', 'Bengali'],
];

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menu, setMenu] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const nav = [
    { href: '/', label: 'Get help', icon: Siren },
    { href: '/requests', label: 'My requests', icon: ClipboardList },
    { href: '/responder', label: 'Responder console', icon: Radio },
  ];
  return <div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Route size={20} /></span><span>Road<span className="brand-light">ResQ</span><small>TRAVELER SUPPORT</small></span></Link>
      <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenu(!menu)} data-testid="button-menu">{menu ? <X size={20}/> : <Menu size={20}/>}</button>
      <nav className={`main-nav ${menu ? 'nav-open' : ''}`} aria-label="Main navigation">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenu(false)} className={`nav-link ${location === href || (href === '/requests' && location.startsWith('/track')) ? 'selected' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'home'}`}><Icon size={16}/>{label}</Link>)}
      </nav>
      <div className="top-status"><span className="status-pip"></span> Demo responder network</div>
      <div className="account-actions" aria-label="Account actions">
        {isLoaded && isSignedIn ? <>
          <span className="account-name" data-testid="text-account-label">{user.fullName || user.username || user.primaryEmailAddress?.emailAddress || 'Your account'}</span>
          <button type="button" className="account-signout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
        </> : isLoaded ? <>
          <Link href="/sign-in" className="account-link" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="account-link create" data-testid="link-create-account">Create account</Link>
        </> : <span className="account-loading" aria-label="Loading account" data-testid="status-account-loading"></span>}
      </div>
    </header>
    <main className="page-wrap">{children}</main>
    <footer className="site-footer"><span>ROAD RESQ <span className="mono">/</span> Stay with your vehicle only if it is safe.</span><span>Emergency? Call your local emergency number.</span></footer>
  </div>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <div className="eyebrow"><span></span>{children}</div>; }
function SectionTitle({ kicker, title, detail }: { kicker: string; title: string; detail?: string }) {
  return <div className="section-title"><div><Eyebrow>{kicker}</Eyebrow><h2>{title}</h2></div>{detail && <p>{detail}</p>}</div>;
}
function QueryError({ retry }: { retry: () => void }) { return <div className="feedback error-box" data-testid="status-error"><AlertTriangle size={18}/><div><b>We couldn’t load this just now.</b><span>Your information is safe. Try again in a moment.</span></div><button className="text-button" onClick={retry} data-testid="button-retry">Retry</button></div>; }
function Skeleton({ count = 2 }: { count?: number }) { return <div className="skeleton-stack" aria-label="Loading"><span className="skeleton wide"/>{Array.from({ length: count }, (_, i) => <span className="skeleton" key={i}/>)}</div>; }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill status-${status}`} data-testid="status-request">{statusNames[status] || status.replaceAll('_', ' ')}</span>; }

function SosConfirmDialog({ onClose, onConfirm, busy }: {
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return <div className="modal-scrim" role="presentation">
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title">
      <div className="modal-symbol"><AlertTriangle size={21}/></div>
      <button className="modal-close" aria-label="Close confirmation" onClick={onClose} data-testid="button-close-sos"><X size={18}/></button>
      <Eyebrow>PLEASE READ</Eyebrow><h2 id="sos-title">Record SOS escalation?</h2>
      <p>This action only records and simulates an escalation in Road ResQ. <b>It does not contact emergency services or dispatch emergency help.</b></p>
      <p>If you are in immediate danger, call your local emergency number now.</p>
      <div className="modal-actions"><button className="btn btn-outline" onClick={onClose} data-testid="button-cancel-sos">Cancel</button><button className="btn btn-sos" disabled={busy} onClick={onConfirm} data-testid="button-confirm-sos">{busy ? 'Recording…' : 'Record SOS'}<ArrowRight size={15}/></button></div>
    </div>
  </div>;
}

function HomePage() {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState<RescueIssueType | 'auto'>('auto');
  const [vehicleType, setVehicleType] = useState('');
  const [area, setArea] = useState('Bengaluru Outer Ring Road · demo location');
  const [latitude, setLatitude] = useState('12.9563');
  const [longitude, setLongitude] = useState('77.7016');
  const [safeMode, setSafeMode] = useState(true);
  const [trustedContact, setTrustedContact] = useState(true);
  const [womenSafeMode, setWomenSafeMode] = useState(false);
  const [femalePreference, setFemalePreference] = useState(false);
  const [serviceCenter, setServiceCenter] = useState(false);
  const [nightService, setNightService] = useState(new Date().getHours() >= 20 || new Date().getHours() < 6);
  const [weakNetwork, setWeakNetwork] = useState(false);
  const [imageName, setImageName] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('en-IN');
  const [dictating, setDictating] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [locationPending, setLocationPending] = useState(false);
  const [fallbackCopied, setFallbackCopied] = useState(false);
  const [homeSosPrompt, setHomeSosPrompt] = useState(false);
  const [homeSosNotice, setHomeSosNotice] = useState('');
  const recognitionRef = useRef<DemoRecognition | null>(null);
  const [triage, setTriage] = useState<RescueTriage | null>(null);
  const [matches, setMatches] = useState<ResponderMatch[] | null>(null);
  const [, setLocation] = useLocation();
  const triageMutation = useTriageRescue();
  const matchMutation = useMatchResponders();
  const createMutation = useCreateRescueRequest();
  const sosMutation = useActivateRescueSos();
  const busy = triageMutation.isPending || matchMutation.isPending || createMutation.isPending;
  const effectiveSafeMode = safeMode || womenSafeMode;
  const effectiveContactSharing = trustedContact || womenSafeMode;
  const effectiveFemalePreference = femalePreference || womenSafeMode;
  const effectiveServiceCenter = serviceCenter || womenSafeMode;
  const clearAssessment = () => {
    setTriage(null);
    setMatches(null);
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location access is not available in this browser. You can enter a landmark and coordinates instead.');
      return;
    }
    setLocationPending(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        setArea('Current GPS position');
        clearAssessment();
        setLocationMessage('Browser location added to this demo request.');
        setLocationPending(false);
      },
      () => {
        setLocationMessage('Location was not available. You can enter a nearby landmark and coordinates instead.');
        setLocationPending(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const startDictation = () => {
    const speechWindow = window as VoiceWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage('Voice typing is not supported in this browser. You can type your description instead.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = voiceLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const result = event as Event & {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      };
      const transcript = Array.from(
        { length: result.results.length - result.resultIndex },
        (_, index) => result.results[result.resultIndex + index]?.[0]?.transcript || '',
      ).join(' ').trim();
      if (transcript) setDescription((current) => `${current} ${transcript}`.trim());
      if (transcript) clearAssessment();
      setVoiceMessage(transcript ? 'Dictation added. Check it before sending.' : 'No speech was recognized. You can try again or type your description.');
    };
    recognition.onerror = () => {
      setVoiceMessage('Voice typing stopped. You can try again or type your description.');
      setDictating(false);
    };
    recognition.onend = () => setDictating(false);
    setVoiceMessage('Browser voice typing is listening. The transcript will appear in the description.');
    setDictating(true);
    try {
      recognition.start();
    } catch {
      setDictating(false);
      setVoiceMessage('Voice typing could not start. You can try again or type your description.');
    }
  };

  const copyOfflineMessage = async () => {
    const message = [
      'ROAD RESQ SOS — DEMO ONLY',
      `Issue: ${issueType === 'auto' ? 'Roadside assistance' : issueOptions.find((option) => option.value === issueType)?.label}`,
      `Location: ${area || 'Location not provided'}`,
      `Coordinates: ${latitude}, ${longitude}`,
      'This message was prepared locally; no emergency service or contact was notified.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(message);
      setFallbackCopied(true);
    } catch {
      setLocationMessage('Clipboard access was blocked. Use the location and issue details shown here to contact someone directly.');
    }
  };

  const loadNightDemo = () => {
    setDescription('My car has stopped and smoke is coming from the front. I am alone near the highway and my signal is weak.');
    setIssueType('overheating');
    setVehicleType('SUV');
    setArea('Bengaluru Outer Ring Road · sample location');
    setLatitude('12.9563');
    setLongitude('77.7016');
    setSafeMode(true);
    setTrustedContact(true);
    setWomenSafeMode(true);
    setFemalePreference(true);
    setServiceCenter(true);
    setNightService(true);
    setWeakNetwork(true);
    setImageName('');
    setFallbackCopied(false);
    clearAssessment();
  };

  const recordHomeSos = () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationMessage('Enter valid coordinates before recording this demo SOS.');
      setHomeSosPrompt(false);
      return;
    }
    sosMutation.mutate({ data: {
      emergencyType: issueType === 'auto' ? 'roadside_assistance' : issueType,
      latitude: lat, longitude: lng, area: area.trim() || 'Bengaluru · demo location',
      trustedContactSharing: effectiveContactSharing,
    } }, {
      onSuccess: (event) => {
        setHomeSosNotice(event.contactNotice);
        setHomeSosPrompt(false);
      },
    });
  };

  const doTriage = (event?: FormEvent) => {
    event?.preventDefault();
    clearAssessment();
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationMessage('Enter valid latitude and longitude, or use your browser location.');
      return;
    }
    const selectedIssue = issueType === 'auto' ? undefined : issueType;
    triageMutation.mutate({ data: {
      description: description.trim(), issueType: selectedIssue, imageAttached: Boolean(imageName),
      night: nightService, weakNetwork, latitude: lat, longitude: lng,
    } }, {
      onSuccess: (result) => {
        setTriage(result); setMatches(null);
        matchMutation.mutate({ data: {
          issueType: result.issueType, latitude: lat, longitude: lng, safeMode: effectiveSafeMode,
          verifiedOnly: true, femaleResponderPreference: effectiveFemalePreference,
          serviceCenterPreference: effectiveServiceCenter, nightService, weakNetwork,
          vehicleType: vehicleType === 'Electric vehicle' ? 'EV' : vehicleType || undefined,
        } }, {
          onSuccess: (found) => setMatches(found),
        });
      },
    });
  };
  const dispatch = (responderId: string, priceMin: number, priceMax: number) => {
    if (!triage) return;
    createMutation.mutate({ data: {
      description: description.trim(), issueType: triage.issueType, probableIssue: triage.probableIssue,
      priority: triage.priority, riskScore: triage.riskScore, latitude: Number(latitude),
      longitude: Number(longitude), area: area.trim() || 'Current location · demo',
      vehicleType: vehicleType || undefined, responderId, safeMode: effectiveSafeMode,
      trustedContactSharing: effectiveContactSharing, priceMin, priceMax,
    } }, {
      onSuccess: async (request) => {
        await Promise.all([qc.invalidateQueries({ queryKey: getListRescueRequestsQueryKey() }), qc.invalidateQueries({ queryKey: getGetRescueOverviewQueryKey() })]);
        setLocation(`/track/${request.id}`);
      },
    });
  };
  return <div className="page-enter">
    <section className="hero-band">
      <div className="hero-copy"><Eyebrow>ROADSIDE ASSISTANCE, COORDINATED</Eyebrow><h1>Something went wrong.<br/><em>We’ll help with what’s next.</em></h1><p>Tell us what happened. Review a cautious demo assessment, compare sample responders, and choose a next step.</p><div className="hero-assurance"><ShieldCheck size={17}/><span>Safety guidance, transparent estimates, no false certainty.</span></div><button type="button" className="demo-preset" onClick={loadNightDemo} data-testid="button-load-night-demo"><CircleDot size={14}/> Preview the 12:30 AM Women Safe Mode demo <ArrowRight size={14}/></button></div>
      <div className="hero-graphic" aria-hidden="true"><div className="graphic-sun"></div><div className="graphic-road"><span className="route-line"></span></div><div className="graphic-pin"><MapPin size={23}/></div><div className="graphic-label"><span className="label-dot"></span> SAMPLE NETWORK PREVIEW</div><div className="graphic-coord mono">12°57'22.7"N<br/>77°42'05.8"E</div></div>
    </section>
    <div className="intake-layout">
      <section className="panel intake-panel">
        <div className="panel-head"><div><Eyebrow>01 / Tell us what happened</Eyebrow><h2>Let’s get you moving safely.</h2></div><span className="step-count">01—03</span></div>
        <form onSubmit={doTriage}>
          <label className="field-label" htmlFor="issue">What’s the situation?</label>
          <select id="issue" value={issueType} onChange={e => {setIssueType(e.target.value as RescueIssueType | 'auto');clearAssessment()}} data-testid="select-issue">
            {issueOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <label className="field-label" htmlFor="description">Describe what you’re noticing</label>
          <textarea id="description" required maxLength={2000} value={description} onChange={e => {setDescription(e.target.value);clearAssessment()}} placeholder="For example: I heard a thump and the car is pulling to the right…" data-testid="input-description"/>
          <div className="char-count">{description.length} / 2,000</div>
          <div className="assist-tools">
            <label className="upload-action"><input type="file" accept="image/*" onChange={event=>{setImageName(event.target.files?.[0]?.name || '');clearAssessment()}} data-testid="input-photo"/><Upload size={15}/> {imageName ? 'Change photo' : 'Attach a photo'}</label>
            <div className="voice-tools"><label className="voice-language-label" htmlFor="voice-language">Voice language</label><select id="voice-language" value={voiceLanguage} onChange={event=>setVoiceLanguage(event.target.value)} data-testid="select-voice-language">{voiceLanguages.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button type="button" className="voice-action" onClick={startDictation} disabled={dictating} data-testid="button-dictate"><Mic size={15}/>{dictating ? 'Listening…' : 'Dictate'}</button></div>
          </div>
          <p className="assist-disclaimer">{imageName ? `Selected: ${imageName}. ` : ''}Photos stay on this device and aren’t analyzed or uploaded in this demo. Voice typing is supplied by your browser; check the transcript before sending.</p>
          {voiceMessage && <p className="inline-hint" role="status" data-testid="status-voice">{voiceMessage}</p>}
          <p className="language-disclaimer">You can write in your language; this demo does not translate messages. Triage is most reliable for English keywords or a selected issue type.</p>
          <div className="field-row"><div className="field-group"><label className="field-label" htmlFor="vehicle">Vehicle</label><select id="vehicle" value={vehicleType} onChange={e => {setVehicleType(e.target.value);clearAssessment()}} data-testid="select-vehicle"><option value="">Choose vehicle type</option>{['Car','SUV','Motorcycle','Electric vehicle'].map(v=><option key={v}>{v}</option>)}</select></div><div className="field-group"><label className="field-label" htmlFor="area">Your location / nearby landmark</label><div className="location-input-row"><input id="area" value={area} onChange={e=>{setArea(e.target.value);clearAssessment()}} placeholder="Highway, exit, or town" data-testid="input-location"/><button type="button" className="location-button" onClick={useCurrentLocation} disabled={locationPending} data-testid="button-current-location"><Navigation size={14}/>{locationPending ? 'Finding…' : 'Use GPS'}</button></div></div></div>
          {locationMessage && <p className="inline-hint" role="status" data-testid="status-location">{locationMessage}</p>}
          <details className="location-details"><summary data-testid="toggle-location-details"><LocateFixed size={15}/> Location coordinates <span>Adjust if needed</span></summary><div className="field-row coord-fields"><label>Latitude<input type="number" step="any" value={latitude} onChange={e=>{setLatitude(e.target.value);clearAssessment()}} data-testid="input-latitude"/></label><label>Longitude<input type="number" step="any" value={longitude} onChange={e=>{setLongitude(e.target.value);clearAssessment()}} data-testid="input-longitude"/></label></div></details>
          <div className="safety-box"><div className="safety-icon"><Shield size={18}/></div><div className="safety-copy"><b>Safety preferences</b><span>These help us find the right kind of support.</span></div></div>
          <div className="toggle-list">
            <label className="toggle-row"><span><b>Women Safe Rescue Mode</b><small>Prioritize verified responders, a woman responder if available, a service center, and trusted-contact updates.</small></span><input type="checkbox" checked={womenSafeMode} onChange={e=>{setWomenSafeMode(e.target.checked);clearAssessment()}} data-testid="toggle-women-safe-mode"/><i/></label>
            <label className="toggle-row"><span><b>Prefer verified responders</b><small>Only responders marked verified in the sample directory are shown.</small></span><input type="checkbox" checked={safeMode} onChange={e=>{setSafeMode(e.target.checked);clearAssessment()}} data-testid="toggle-safe-mode"/><i/></label>
            <label className="toggle-row"><span><b>Trusted-contact sharing preference</b><small>Saved with this request; the demo does not send messages.</small></span><input type="checkbox" checked={trustedContact} onChange={e=>{setTrustedContact(e.target.checked);clearAssessment()}} data-testid="toggle-contact-sharing"/><i/></label>
          </div>
          <details className="more-preferences"><summary data-testid="toggle-more-preferences">More responder preferences</summary><div className="check-options"><label><input type="checkbox" checked={femalePreference} onChange={e=>{setFemalePreference(e.target.checked);clearAssessment()}} data-testid="toggle-female-preference"/> Prefer a woman responder if available</label><label><input type="checkbox" checked={serviceCenter} onChange={e=>{setServiceCenter(e.target.checked);clearAssessment()}} data-testid="toggle-service-center"/> Prefer service-center support</label><label><input type="checkbox" checked={nightService} onChange={e=>{setNightService(e.target.checked);clearAssessment()}} data-testid="toggle-night-service"/> Need night service</label><label><input type="checkbox" checked={weakNetwork} onChange={e=>{setWeakNetwork(e.target.checked);setFallbackCopied(false);clearAssessment()}} data-testid="toggle-weak-network"/> Weak or unreliable data connection</label></div></details>
          {weakNetwork && <div className="low-network-panel"><div><b>Low-network fallback</b><p>Keep these details on screen. Prepare a compact message to share through your phone’s own SMS or calling app. This demo does not send it or work as offline dispatch.</p></div><button type="button" className="text-button" onClick={copyOfflineMessage} data-testid="button-copy-fallback">{fallbackCopied ? <><Check size={14}/> Copied</> : 'Copy fallback message'}</button></div>}
          <button type="submit" className="btn btn-primary btn-wide" disabled={busy || !description.trim()} data-testid="button-triage"><span>{triageMutation.isPending ? 'Reviewing your situation…' : 'Find the right help'}</span>{triageMutation.isPending ? <span className="button-pulse"/> : <ArrowRight size={18}/>}</button>
          <div className="form-footnote"><ShieldCheck size={14}/> Description and location go to the demo API for triage and matching. Your selected photo stays on this device.</div>
        </form>
          {triageMutation.isError && <QueryError retry={()=>doTriage()}/>}
      </section>
      <aside className="side-column">
        {!triage && <div className="side-note"><div className="side-note-icon"><CircleHelp size={20}/></div><h3>First, get to a safe place.</h3><p>If you can, move away from traffic. Turn on hazard lights and stay inside the vehicle if it’s safer there.</p><span className="side-note-rule"></span><small>Road ResQ is not an emergency service.</small></div>}
        {triage && <TriageResult triage={triage} matches={matches} loadingMatches={matchMutation.isPending} matchError={matchMutation.isError} onRetry={() => matchMutation.mutate({data:{issueType:triage.issueType,latitude:Number(latitude),longitude:Number(longitude),safeMode:effectiveSafeMode,verifiedOnly:true,femaleResponderPreference:effectiveFemalePreference,serviceCenterPreference:effectiveServiceCenter,nightService,weakNetwork,vehicleType:vehicleType === 'Electric vehicle' ? 'EV' : vehicleType||undefined}}, {onSuccess:setMatches})} onDispatch={dispatch} busy={createMutation.isPending} dispatchError={createMutation.isError}/>}
        <div className="road-help"><div className="road-help-top"><span className="help-symbol"><Phone size={17}/></span><span className="mono">IF THERE’S IMMEDIATE DANGER</span></div><p>Call your local emergency number. Road ResQ cannot contact emergency services for you.</p></div>
        <div className="home-sos-panel"><div className="sos-top"><span className="sos-icon"><Siren size={18}/></span><span className="mono">NEED URGENT HELP?</span></div><p>Record a demo SOS with this location. It will not notify a trusted contact or emergency service.</p><button type="button" className="btn btn-sos" onClick={()=>setHomeSosPrompt(true)} data-testid="button-home-sos"><Siren size={16}/> Activate SOS</button>{homeSosNotice && <div className="sos-success" role="status" data-testid="status-home-sos">{homeSosNotice}</div>}{sosMutation.isError && <div className="inline-error">SOS could not be recorded. Please check your connection.</div>}</div>
      </aside>
    </div>
    {homeSosPrompt && <SosConfirmDialog onClose={()=>setHomeSosPrompt(false)} onConfirm={recordHomeSos} busy={sosMutation.isPending}/>}
  </div>;
}

function TriageResult({ triage, matches, loadingMatches, matchError, onRetry, onDispatch, busy, dispatchError }: {
  triage: RescueTriage; matches: ResponderMatch[] | null;
  loadingMatches: boolean; matchError: boolean; onRetry: () => void; onDispatch: (id: string, min: number, max: number) => void; busy: boolean; dispatchError: boolean;
}) {
  return <div className="triage-stack page-enter">
    <section className="triage-card"><div className="triage-top"><span className="triage-icon"><Activity size={17}/></span><span className="mono">PROBABLE DEMO TRIAGE</span><span className={`priority priority-${triage.priority}`}>{triage.priority} priority</span></div>
      <h3>{triage.probableIssue}</h3><p className="disclaimer">This is a preliminary, demo assessment—not a mechanical diagnosis.</p>
      <div className="triage-metrics"><div><small>Confidence</small><b>{triage.confidence}%</b></div><div><small>Roadside risk</small><b>{triage.riskScore}/100</b></div><div><small>Estimated range</small><b>₹{triage.priceMin}–₹{triage.priceMax}</b></div><div><small>Support type</small><b>{triage.responderType}</b></div></div>
      {triage.questions.length > 0 && <div className="guidance-block"><b>One thing to check</b>{triage.questions.map((q,i)=><p key={i}>{q}</p>)}</div>}
      {triage.safetyGuidance.length > 0 && <div className="guidance-block"><b><Shield size={14}/> Until help arrives</b>{triage.safetyGuidance.map((q,i)=><p key={i}>{q}</p>)}</div>}
    </section>
    <section className="matches-block"><div className="matches-heading"><div><Eyebrow>02 / Nearby support</Eyebrow><h3>Good help, close by.</h3></div><span className="match-count">{matches?.length ?? (loadingMatches ? '…' : '—')} MATCHES</span></div>
      {loadingMatches && <Skeleton count={2}/>}
      {matchError && <QueryError retry={onRetry}/>}
      {matches && matches.length === 0 && <div className="empty-state"><Compass size={22}/><b>No responders matched just yet.</b><span>Try adjusting your preferences, or update your description.</span><button className="text-button" onClick={onRetry} data-testid="button-rematch">Search again</button></div>}
      {matches?.map((responder, index) => <article className={`responder-card ${index === 0 ? 'best-match' : ''}`} key={responder.id} data-testid={`card-responder-${responder.id}`}>
        <div className="responder-head"><div className="responder-avatar">{responder.name.slice(0,1)}</div><div className="responder-name"><b>{responder.name}</b><span>{responder.specialty}</span></div><span className="responder-rating"><span>★</span> {responder.rating.toFixed(1)}</span></div>
        <div className="responder-facts"><span><Clock3 size={14}/>{responder.etaMinutes} min · estimate</span><span><MapPin size={14}/>{responder.distanceKm.toFixed(1)} km · estimate</span><span><BadgeCheck size={14}/>{responder.verified ? 'Demo verified' : 'Listed'}</span>{responder.femaleResponder && <span>Woman responder</span>}</div>
        <div className="match-score"><Activity size={13}/> Suitability score <b>{responder.suitabilityScore}/100</b> <span>demo scoring</span></div>
        <div className="responder-bottom"><div><small>ESTIMATED RANGE · INR</small><b>₹{responder.priceMin}–₹{responder.priceMax}</b></div><button className="btn btn-small btn-primary" onClick={()=>onDispatch(responder.id,responder.priceMin,responder.priceMax)} disabled={busy} data-testid={`button-dispatch-${responder.id}`}>{busy ? 'Sending…' : 'Choose responder'}<ArrowRight size={14}/></button></div>
      </article>)}
      {dispatchError && <div className="inline-error" role="alert">We couldn’t send your request. Please try choosing this responder again.</div>}
      {matches?.length ? <p className="match-disclaimer"><ShieldCheck size={13}/> Sample Bengaluru profiles and demo scoring only—not live availability, identity checks, dispatch, routing, or guaranteed prices.</p> : null}
    </section>
  </div>;
}

function RequestsPage() {
  const overview = useGetRescueOverview();
  const requests = useListRescueRequests();
  return <div className="page-enter">
    <div className="page-heading"><div><Eyebrow>YOUR ROAD RESQ</Eyebrow><h1>Requests, at a glance.</h1><p>See what’s in progress and revisit previous roadside support.</p></div><Link className="btn btn-primary" href="/" data-testid="link-new-request"><Siren size={17}/> Start a request</Link></div>
    {overview.isLoading ? <Skeleton count={2}/> : overview.isError ? <QueryError retry={()=>overview.refetch()}/> : <div className="overview-strip">
      <Metric icon={<Activity size={18}/>} label="Active requests" value={overview.data?.activeRequests ?? 0}/>
      <Metric icon={<Check size={18}/>} label="Completed today" value={overview.data?.completedToday ?? 0}/>
      <Metric icon={<BadgeCheck size={18}/>} label="Sample responder profiles" value={overview.data?.verifiedResponders ?? 0}/>
      <Metric icon={<Clock3 size={18}/>} label="Average arrival" value={`${overview.data?.averageEta ?? '—'} min`}/>
    </div>}
    <SectionTitle kicker="REQUEST HISTORY" title="Your roadside timeline" detail="The latest first."/>
    {requests.isLoading && <Skeleton count={4}/>}
    {requests.isError && <QueryError retry={()=>requests.refetch()}/>}
    {requests.data?.length === 0 && <div className="empty-large"><div className="empty-stamp"><Route size={25}/></div><h3>No requests yet.</h3><p>If you need roadside help, we’ll guide you through each step.</p><Link href="/" className="btn btn-primary" data-testid="link-empty-start">Get roadside help <ArrowRight size={16}/></Link></div>}
    <div className="request-list">{requests.data?.map(r=><RequestRow key={r.id} request={r}/>)}</div>
  </div>;
}
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) { return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><b data-testid={`metric-${label.toLowerCase().replaceAll(' ','-')}`}>{value}</b></div></div>; }
function RequestRow({ request }: { request: RescueRequest }) {
  return <Link href={`/track/${request.id}`} className="request-row" data-testid={`link-request-${request.id}`}><div className="request-type-icon">{request.issueType === 'battery' ? <Battery size={19}/> : request.issueType === 'fuel' ? <Fuel size={19}/> : request.issueType === 'towing' ? <Truck size={19}/> : <Wrench size={19}/>}</div><div className="request-main"><div className="request-title">{request.probableIssue || request.description}</div><div className="request-sub"><span><MapPin size={13}/>{request.area}</span><span className="mono">RRQ-{request.id}</span></div></div><StatusPill status={request.status}/><ChevronRight className="row-chevron" size={18}/></Link>;
}

function TrackPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const request = useGetRescueRequest(id, { query: { queryKey: getGetRescueRequestQueryKey(id), enabled: Number.isFinite(id) && id > 0 } });
  const sosMutation = useActivateRescueSos();
  const replanMutation = useReplanRescue();
  const [confirmSos, setConfirmSos] = useState(false);
  const [showReplan, setShowReplan] = useState(false);
  const [replanNote, setReplanNote] = useState('');
  const [sosNotice, setSosNotice] = useState('');
  const updateCache = async (updated: RescueRequest) => {
    qc.setQueryData(getGetRescueRequestQueryKey(id), updated);
    await Promise.all([qc.invalidateQueries({queryKey:getListRescueRequestsQueryKey()}),qc.invalidateQueries({queryKey:getGetRescueOverviewQueryKey()})]);
  };
  const activateSos = () => {
    const r = request.data;
    if (!r) return;
    sosMutation.mutate({ data: { rescueId: r.id, emergencyType: 'roadside_assistance', latitude: r.latitude, longitude: r.longitude, area: r.area, trustedContactSharing: r.trustedContactSharing } }, {
      onSuccess: event => { setSosNotice(event.contactNotice || 'Your escalation has been recorded.'); setConfirmSos(false); },
    });
  };
  if (request.isLoading) return <Skeleton count={4}/>;
  if (request.isError || !request.data) return <div className="page-enter"><QueryError retry={()=>request.refetch()}/><Link href="/requests" className="text-button" data-testid="link-back-requests">Back to requests</Link></div>;
  const r = request.data;
  const steps: RescueStatus[] = ['requested','responder_assigned','en_route','arrived','repair_in_progress','resolved'];
  const activeIndex = Math.max(0, steps.indexOf(r.status));
  return <div className="page-enter">
    <div className="track-header"><Link href="/requests" className="back-link" data-testid="link-back-requests"><ArrowRight size={15}/> All requests</Link><div className="track-head-content"><div><Eyebrow>DEMO REQUEST RRQ-{r.id} / {new Date(r.createdAt).toLocaleDateString()}</Eyebrow><h1>Your rescue plan, step by step.</h1><p>This prototype tracks demo status updates; it does not dispatch providers or track a live vehicle.</p></div><StatusPill status={r.status}/></div></div>
    <div className="track-layout">
      <section className="track-main">
        <div className="arrival-panel"><div className="arrival-top"><div><Eyebrow>DEMO RESCUE STATUS</Eyebrow><h2>{statusNames[r.status] || r.status}</h2><p>{r.status === 'en_route' ? `Sample responder ${r.responderName} is marked en route in the demo.` : `Sample assignment: ${r.responderName}.`}</p></div><div className="eta-chip"><Clock3 size={17}/><span><b>{r.etaMinutes} min</b><small>sample estimate</small></span></div></div>
          <div className="map-surface road-map"><div className="map-road-label">ILLUSTRATIVE ROUTE · NOT LIVE</div><div className="map-origin"><span></span><small>SAMPLE RESPONDER</small></div><div className="map-path"><i></i><i></i><i></i></div><div className="map-destination"><MapPin size={21}/><small>YOUR PIN</small></div><div className="map-coord mono">{r.latitude.toFixed(4)}° N<br/>{Math.abs(r.longitude).toFixed(4)}° E</div></div>
          <div className="distance-line"><span><Navigation size={15}/>{r.distanceKm.toFixed(1)} km · demo estimate</span><span className="small-muted">Sample distance and arrival time; no live GPS tracking.</span></div>
        </div>
        <div className="panel timeline-panel"><Eyebrow>WHAT HAPPENS NEXT</Eyebrow><div className="timeline">{steps.map((step,index)=><div className={`timeline-step ${index < activeIndex ? 'complete' : index === activeIndex ? 'current' : ''}`} key={step}><span className="timeline-dot">{index < activeIndex ? <Check size={12}/> : index + 1}</span><span>{statusNames[step]}</span></div>)}</div></div>
        {r.status === 'repair_in_progress' && <div className="replan-card"><div className="replan-icon"><Truck size={20}/></div><div className="replan-copy"><b>Repair didn’t get you moving?</b><p>We can help re-plan this request for towing support.</p></div><button className="btn btn-outline" onClick={()=>setShowReplan(!showReplan)} data-testid="button-open-replan">{showReplan ? 'Close' : 'Re-plan for a tow'}</button>
          {showReplan && <div className="replan-form"><label className="field-label" htmlFor="replan-note">What happened? <span>(optional)</span></label><textarea id="replan-note" maxLength={500} value={replanNote} onChange={e=>setReplanNote(e.target.value)} placeholder="Tell us why a tow is needed." data-testid="input-replan-note"/><button className="btn btn-primary" disabled={replanMutation.isPending} onClick={()=>replanMutation.mutate({id:r.id,data:{note:replanNote||undefined}},{onSuccess:updateCache})} data-testid="button-confirm-replan">{replanMutation.isPending ? 'Updating request…' : 'Confirm towing re-plan'}<ArrowRight size={16}/></button>{replanMutation.isError && <span className="inline-error">Couldn’t update this request. Please retry.</span>}</div>}
        </div>}
      </section>
      <aside className="track-aside">
        <div className="panel responder-detail"><Eyebrow>SAMPLE RESPONDER</Eyebrow><div className="responder-head large"><div className="responder-avatar">{r.responderName.slice(0,1)}</div><div className="responder-name"><b>{r.responderName}</b><span>{r.responderSpecialty}</span></div></div><div className="detail-separator"/><div className="detail-line"><span>Estimated cost · INR</span><b>₹{r.priceMin}–₹{r.priceMax}</b></div><div className="detail-line"><span>Issue reported</span><b>{r.probableIssue}</b></div><div className="detail-line"><span>Safety mode</span><b>{r.safeMode ? 'On' : 'Off'}</b></div><div className="detail-line"><span>Contact sharing</span><b>{r.trustedContactSharing ? 'Preferred · not sent' : 'Off'}</b></div><p className="detail-foot"><ShieldCheck size={14}/> Sample profile and price estimate only. Confirm real identity, price, and timing directly with a provider.</p></div>
        <div className="sos-panel"><div className="sos-top"><span className="sos-icon"><Siren size={18}/></span><span className="mono">NEED URGENT HELP?</span></div><p>If your situation becomes unsafe, use SOS to record and simulate an escalation.</p><button className="btn btn-sos" onClick={()=>setConfirmSos(true)} data-testid="button-sos"><Siren size={16}/> Activate SOS</button>
          {sosNotice && <div className="sos-success" data-testid="status-sos-result"><Check size={14}/>{sosNotice}</div>}
          {sosMutation.isError && <div className="inline-error">SOS could not be recorded. Please try again.</div>}
        </div>
      </aside>
    </div>
    {confirmSos && <SosConfirmDialog onClose={()=>setConfirmSos(false)} onConfirm={activateSos} busy={sosMutation.isPending}/>}
  </div>;
}

function ResponderPage() {
  const qc = useQueryClient();
  const requests = useListRescueRequests();
  const responders = useListRescueResponders();
  const update = useUpdateRescueStatus();
  const activeRequests = requests.data?.filter(r=>!['resolved','cancelled'].includes(r.status)) || [];
  const invalidate = async (r: RescueRequest) => {
    qc.setQueryData(getGetRescueRequestQueryKey(r.id),r);
    await Promise.all([qc.invalidateQueries({queryKey:getListRescueRequestsQueryKey()}),qc.invalidateQueries({queryKey:getGetRescueOverviewQueryKey()}),qc.invalidateQueries({queryKey:getListRescueRespondersQueryKey()})]);
  };
  const advance = (r: RescueRequest) => {
    const next: Partial<Record<RescueStatus, RescueStatus>> = { requested:'responder_assigned', responder_assigned:'en_route', en_route:'arrived', arrived:'repair_in_progress', repair_in_progress:'resolved', towing_requested:'resolved' };
    const status = next[r.status];
    if (status) update.mutate({id:r.id,data:{status}},{onSuccess:invalidate});
  };
  const responderCount = responders.data?.length ?? 0;
  return <div className="page-enter">
    <div className="demo-banner"><span className="demo-mark"><CircleDot size={15}/></span><div><b>Responder console · demo environment</b><span>Prototype view. Responder profiles and job data shown here are sample/demo data and are not proof of real identity or formal vetting.</span></div><span className="demo-badge">DEMO</span></div>
     <div className="page-heading responder-page-heading"><div><Eyebrow>FIELD OPERATIONS / PROTOTYPE</Eyebrow><h1>Rescue desk.</h1><p>Review assigned jobs and move each rescue forward.</p></div><div className="console-signal"><span className="status-pip"></span> Sample API active</div></div>
    <div className="console-summary"><Metric icon={<ClipboardList size={18}/>} label="Open rescue jobs" value={requests.isLoading ? '—' : activeRequests.length}/><Metric icon={<BadgeCheck size={18}/>} label="Listed responders" value={responders.isLoading ? '—' : responderCount}/><Metric icon={<Clock3 size={18}/>} label="Average arrival" value="Live by request"/></div>
    <SectionTitle kicker="ASSIGNED QUEUE" title="Jobs needing your attention" detail="Advance the status as the rescue progresses."/>
    {requests.isLoading && <Skeleton count={3}/>}
    {requests.isError && <QueryError retry={()=>requests.refetch()}/>}
    {requests.data && activeRequests.length === 0 && <div className="empty-large"><div className="empty-stamp"><Check size={25}/></div><h3>Queue is clear.</h3><p>New assigned rescue jobs will appear here.</p></div>}
    <div className="job-list">{activeRequests.map(r=><article className="job-card" key={r.id} data-testid={`card-job-${r.id}`}><div className="job-rail"><span className="job-number mono">RRQ-{r.id}</span><StatusPill status={r.status}/></div><div className="job-main"><h3>{r.probableIssue}</h3><p>{r.description}</p><div className="job-meta"><span><MapPin size={14}/>{r.area}</span><span><Clock3 size={14}/>{r.etaMinutes} min ETA</span><span><CarFront size={14}/>{r.vehicleType || 'Vehicle not specified'}</span></div><div className="job-customer"><span className="customer-avatar">{r.responderName.slice(0,1)}</span><span>Assigned to <b>{r.responderName}</b> · {r.responderSpecialty}</span></div></div><div className="job-actions"><Link className="text-button" href={`/track/${r.id}`} data-testid={`link-job-track-${r.id}`}>View tracking <ArrowUpRight size={14}/></Link>{r.status !== 'resolved' && r.status !== 'cancelled' && <button className="btn btn-primary btn-small" onClick={()=>advance(r)} disabled={update.isPending} data-testid={`button-advance-${r.id}`}>{update.isPending ? 'Updating…' : nextLabel(r.status)}<ArrowRight size={14}/></button>}</div>{update.isError && <div className="inline-error">Status update failed. Try again.</div>}</article>)}</div>
    <section className="demo-note"><ShieldCheck size={17}/><p><b>Demo safeguards</b><br/>This console is a prototype. The responder directory is surfaced through the configured API; this screen does not certify identities, credentials, or background checks.</p></section>
  </div>;
}
function nextLabel(status: string) { return ({requested:'Assign responder',responder_assigned:'Mark en route',en_route:'Mark arrived',arrived:'Begin repair',repair_in_progress:'Mark resolved',towing_requested:'Mark resolved'} as Record<string,string>)[status] || 'Advance status'; }

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <WRoute path="/sign-in/*?"><div className="auth-page page-enter"><div className="auth-intro"><Eyebrow>ROAD RESQ ACCOUNT</Eyebrow><h1>Welcome back.</h1><p>Sign in to see your account. Roadside help remains available without signing in.</p></div><div className="auth-clerk"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div><Link className="auth-return" href="/" data-testid="link-auth-home">Back to roadside help</Link></div></WRoute>
    <WRoute path="/sign-up/*?"><div className="auth-page page-enter"><div className="auth-intro"><Eyebrow>ROAD RESQ ACCOUNT</Eyebrow><h1>Make room for peace of mind.</h1><p>Create an account for a more personal Road ResQ experience. You can still request help without one.</p></div><div className="auth-clerk"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div><Link className="auth-return" href="/" data-testid="link-auth-home">Back to roadside help</Link></div></WRoute>
    <WRoute path="/" component={HomePage}/>
    <WRoute path="/requests" component={RequestsPage}/>
    <WRoute path="/track/:id" component={TrackPage}/>
    <WRoute path="/responder" component={ResponderPage}/>
    <WRoute component={NotFound}/>
  </Switch></Shell></ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your Road ResQ account' } },
      signUp: { start: { title: 'Create your account', subtitle: 'A little more peace of mind on the road' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator/>
    <Router/>
  </ClerkProvider>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;

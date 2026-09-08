import type {
  Resource,
  ResourceLink,
  Folder,
  Blueprint,
} from './resource-model';
export const stages = ['Up next', 'Doing', 'Review', 'Done'] as const;
export type Stage = (typeof stages)[number];
export type Member = { id: string; name: string; role: string; color: string };
export type Space = {
  id: string;
  name: string;
  type: string;
  color: string;
  brief: string;
  owner: string;
  meeting: string;
  tagline: string;
  wants: string;
  needs: string;
  audience: string;
  voice: string;
  website: string;
  coverUrl: string;
  logoUrl: string;
  brandStyle: string;
  revision: number;
};
export type Meeting = {
  id: string;
  spaceId: string;
  title: string;
  startsAt: string;
  agenda: string;
  notes: string;
  decisions: string;
  status: 'Planned' | 'Completed' | 'Cancelled';
  revision: number;
  updatedAt: string;
};
export type SpaceEvent = {
  id: string;
  spaceId: string;
  meetingId: string | null;
  body: string;
  snapshot: string;
  actor: string;
  createdAt: string;
};
export type Project = {
  id: string;
  name: string;
  spaceId: string | null;
  description: string;
  due: string;
};
export type Task = {
  spaceId: string | null;
  id: string;
  title: string;
  projectId: string | null;
  assignee: string;
  reviewer: string;
  stage: Stage;
  description: string;
  due: string;
  priority: string;
  blocked: string;
  deliverable: string;
  delivery: string;
  version: number;
  revision: number;
  position: number;
  updatedAt: string;
  meetingId: string | null;
};
export type Note = {
  id: string;
  taskId: string;
  body: string;
  actor: string;
  createdAt: string;
};
export type Activity = Note;
export type Review = {
  id: string;
  taskId: string;
  version: number;
  reviewer: string;
  decision: string;
  feedback: string;
  createdAt: string;
};
export type Notice = {
  id: string;
  taskId: string;
  recipient: string;
  body: string;
  read: number;
  createdAt: string;
};
export type Tool = {
  id: string;
  name: string;
  description: string;
  projectId: string;
  owner: string;
  url: string;
};
export type Document = {
  id: string;
  title: string;
  collection: string;
  body: string;
};
export type Workspace = {
  resources: Resource[];
  resourceLinks: ResourceLink[];
  folders: Folder[];
  blueprints: Blueprint[];
  members: Member[];
  spaces: Space[];
  projects: Project[];
  tasks: Task[];
  meetings: Meeting[];
  spaceEvents: SpaceEvent[];
  notes: Note[];
  activities: Activity[];
  reviews: Review[];
  notices: Notice[];
  tools: Tool[];
  documents: Document[];
  currentMember: string;
  demo: boolean;
};
export function initialWorkspace(): Workspace {
  const now = new Date().toISOString();
  const members = [
    { id: 'me', name: 'Gabri', role: 'Workspace owner', color: '#6471bf' },
    { id: 'maja', name: 'Maja', role: 'Project manager', color: '#b27f6c' },
    { id: 'sofie', name: 'Sofie', role: 'Content creator', color: '#758b76' },
    { id: 'jonas', name: 'Jonas', role: 'Designer', color: '#6d93b3' },
    { id: 'emma', name: 'Emma', role: 'Content creator', color: '#ad86ab' },
    { id: 'oliver', name: 'Oliver', role: 'Growth', color: '#b69b62' },
  ];
  const spaces: Space[] = [
    ['nord', 'Nord & Form', 'Client', '#6f887a'],
    ['harbor', 'Harbor Coffee', 'Client', '#b5855c'],
    ['journal', 'Studio Journal', 'Owned platform', '#727d9c'],
    ['forma', 'Forma Studio', 'Client', '#a68d96'],
    ['juniper', 'Juniper Hotels', 'Client', '#818e6a'],
    ['morrow', 'Morrow', 'Client', '#658b9b'],
    ['arc', 'Arc Architecture', 'Client', '#9c8873'],
    ['field', 'Field & Folk', 'Client', '#a18562'],
    ['pulse', 'Pulse Fitness', 'Client', '#737da3'],
    ['north', 'North Collective', 'Client', '#8c8e9c'],
  ].map(([id, name, type, color]) => ({
    id,
    name,
    type,
    color,
    brief:
      id === 'nord'
        ? 'Considered design. Everyday living. Calm, confident, human. Lead with materials and craftsmanship.'
        : 'A shared home for the brand, the work, and the decisions along the way.',
    owner: 'maja',
    meeting: '',
    tagline: id === 'nord' ? 'Considered design. Everyday living.' : '',
    wants:
      id === 'nord'
        ? 'Build desire for the autumn collection and turn interest into qualified enquiries.'
        : '',
    needs:
      id === 'nord'
        ? 'A clear path from the first ad to a booked conversation. Lead quality matters more than volume.'
        : '',
    audience:
      id === 'nord'
        ? 'Design-conscious homeowners who value natural materials and things made to last.'
        : '',
    voice:
      id === 'nord'
        ? 'Calm, confident, human. Show the craftsmanship. Give the materials room to speak.'
        : '',
    website: '',
    coverUrl: id === 'nord' ? '/images/nord-form-cover.png' : '',
    logoUrl: '',
    brandStyle: id === 'nord' ? 'serif' : 'sans',
    revision: 0,
  }));
  for (const space of spaces) {
    const profile = editorialSampleProfiles[space.id];
    if (profile) Object.assign(space, profile);
  }
  const projects: Project[] = [
    {
      id: 'autumn',
      name: 'Autumn launch',
      spaceId: 'nord',
      description:
        'Introduce the autumn collection through content, a focused landing page, and a connected lead journey.',
      due: '2026-09-18',
    },
    {
      id: 'social',
      name: 'September content',
      spaceId: 'harbor',
      description: 'A month of stories about the people behind the counter.',
      due: '2026-09-25',
    },
    {
      id: 'editorial',
      name: 'Studio stories',
      spaceId: 'journal',
      description: 'Our ideas and the people behind the work.',
      due: '2026-09-21',
    },
    {
      id: 'internal',
      name: 'A better studio',
      spaceId: null,
      description: 'Make everyday work easier for everyone.',
      due: '2026-09-30',
    },
    {
      id: 'website',
      name: 'Website refresh',
      spaceId: 'juniper',
      description: 'A clear and welcoming home for the next season.',
      due: '2026-10-02',
    },
  ];
  const rows = [
    ['t1', 'Build the autumn landing page', 'autumn', 'me', 'Doing'],
    ['t2', 'Write three campaign concepts', 'autumn', 'me', 'Up next'],
    ['t3', 'Review the paid social creative', 'autumn', 'me', 'Review'],
    ['t4', 'Connect the lead capture flow', 'autumn', 'me', 'Up next'],
    ['t5', 'Confirm the campaign brief', 'autumn', 'me', 'Done'],
    ['t6', 'Edit the founder interview', 'editorial', 'sofie', 'Doing'],
    ['t7', 'Plan the September stories', 'social', 'emma', 'Doing'],
    ['t8', 'Prepare the client meeting', 'social', 'maja', 'Up next'],
    ['t9', 'Refine the homepage direction', 'website', 'jonas', 'Review'],
    ['t10', 'Review lead quality', 'autumn', 'oliver', 'Doing'],
    ['t11', 'Document our review process', 'internal', 'me', 'Up next'],
    ['t12', 'Update the employee handbook', 'internal', 'maja', 'Done'],
  ];
  const tasks: Task[] = rows.map(
    ([id, title, projectId, assignee, stage], position) => ({
      id,
      title,
      projectId,
      spaceId: null,
      assignee,
      reviewer: 'me',
      stage: stage as Stage,
      description:
        id === 't1'
          ? 'Build a focused landing page for the autumn collection. Keep the story calm and material-led. Connect the enquiry form to the lead journey.\n\nReady when:\n• The page works on desktop and mobile\n• Form validation and confirmation are clear\n• Campaign tracking is documented\n• The creative direction matches the approved brief'
          : `Deliver ${title.toLowerCase()} in the context of the project brief. Add the work below and send it for review when it is ready.`,
      due: '2026-09-' + String(7 + (position % 6)).padStart(2, '0'),
      priority: position === 0 ? 'High' : 'Normal',
      blocked: id === 't6' ? 'Waiting for the original footage' : '',
      deliverable:
        stage === 'Review'
          ? 'Autumn, thoughtfully made.\n\nDiscover a collection shaped by natural materials and everyday rituals. Made to become part of your home.\n\nCTA: Explore the collection'
          : '',
      delivery: 'Not configured',
      version: stage === 'Review' ? 1 : 0,
      revision: 0,
      position,
      updatedAt: now,
      meetingId: null,
    }),
  );
  return {
    resources: [],
    resourceLinks: [],
    folders: [],
    blueprints: [],
    members,
    spaces,
    projects,
    tasks,
    meetings: [
      {
        id: 'nord-next',
        spaceId: 'nord',
        title: 'Autumn launch · working session',
        startsAt: '2026-09-10T08:00:00.000Z',
        agenda:
          'Review the landing page direction\nAgree the campaign concepts\nCheck lead quality and the booking journey',
        notes: '',
        decisions: '',
        status: 'Planned',
        revision: 0,
        updatedAt: now,
      },
      {
        id: 'nord-kickoff',
        spaceId: 'nord',
        title: 'Autumn collection · direction',
        startsAt: '2026-09-03T08:00:00.000Z',
        agenda: 'Align on the creative direction and launch priorities.',
        notes:
          'The client responded to the quieter visual direction. They want fewer, stronger pieces of content and a landing page that lets the materials speak.',
        decisions:
          'Use material close-ups as the creative foundation.\nKeep one clear enquiry call to action.\nReview lead quality alongside campaign results.',
        status: 'Completed',
        revision: 0,
        updatedAt: now,
      },
    ],
    spaceEvents: [],
    notes: [
      {
        id: 'n1',
        taskId: 't1',
        body: 'The client approved the quieter direction. Use the material close-ups from the brand folder. Keep one clear call to action.',
        actor: 'maja',
        createdAt: now,
      },
    ],
    activities: [],
    reviews: tasks
      .filter((t) => t.stage === 'Review')
      .map((t) => ({
        id: 'r' + t.id,
        taskId: t.id,
        version: 1,
        reviewer: 'me',
        decision: 'Pending',
        feedback: '',
        createdAt: now,
      })),
    notices: [],
    tools: [
      {
        id: 'builder',
        name: 'Landing page builder',
        description: 'Campaign pages connected to the client brand.',
        projectId: 'autumn',
        owner: 'me',
        url: '',
      },
      {
        id: 'content',
        name: 'Brand content generator',
        description: 'Create content using the client’s voice and guidelines.',
        projectId: 'social',
        owner: 'emma',
        url: '',
      },
      {
        id: 'analytics',
        name: 'Campaign calculator',
        description: 'Bring channel measurements into the project.',
        projectId: 'autumn',
        owner: 'oliver',
        url: '',
      },
    ],
    documents: [
      {
        id: 'handbook',
        title: 'Employee handbook',
        collection: 'People & Culture / Documents',
        body: 'Welcome to the studio.\n\nStart your day with My day. Pull work from your projects, keep notes with the task, and request review when the deliverable is ready.\n\nIf work is blocked, record what you need and who can help. Decisions belong with the project so everyone can find them later.\n\nThis is a sample handbook. Replace it with your organization’s policies.',
      },
      {
        id: 'review',
        title: 'How we review work',
        collection: 'Working together / Processes',
        body: '1. Add a deliverable to the task.\n2. Choose the reviewer.\n3. Submit a version for review.\n4. Address requested changes and resubmit.\n5. Record approval before delivery.\n\nExternal delivery is configured separately.',
      },
    ],
    currentMember: 'me',
    demo: true,
  };
}

export const editorialSampleProfiles: Record<string, Partial<Space>> = {
  harbor: {
    tagline: 'Good coffee. Better company.',
    brief:
      'An independent coffee brand built around the everyday ritual. Tell the stories of the people behind the counter, the craft in the cup, and the neighbourhood around it.',
    wants:
      'Become the neighbourhood’s first choice for a slow morning, a good conversation, and a very good cup.',
    needs:
      'Honest, inviting content that turns an online impression into a visit. Keep the people and the craft at the centre.',
    audience:
      'The regulars, the curious, and anyone who believes a coffee break should be a little more than a transaction.',
    voice:
      'Warm, conversational, a little playful. Specific about coffee, generous about everything else.',
    coverUrl: '/images/harbor-coffee-editorial.png',
    brandStyle: 'editorial',
    color: '#934533',
  },
  juniper: {
    tagline: 'Somewhere to slow down.',
    brief:
      'A collection of considered places to stay. Let the light, the landscape, and the small details tell the story of a more thoughtful kind of escape.',
    wants:
      'Inspire guests to imagine themselves here, and turn that feeling into a direct booking.',
    needs:
      'A clear, beautiful website with a seamless route to booking. Content should communicate the experience before the amenities.',
    audience:
      'Curious travellers who choose character, quiet, and a sense of place over the ordinary.',
    voice:
      'Unhurried, evocative, precise. Fewer words; a stronger sense of being there.',
    coverUrl: '/images/juniper-hotels-editorial.png',
    brandStyle: 'serif',
    color: '#728c8b',
  },
};

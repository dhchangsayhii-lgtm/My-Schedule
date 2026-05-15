import { useState, useMemo, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isToday as isDateToday,
  isAfter,
  startOfToday,
  startOfDay
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Users, 
  Calendar as CalendarIcon,
  Cloud,
  Share2,
  Bell,
  CheckCircle2,
  LayoutDashboard,
  ClipboardList,
  StickyNote,
  PieChart as PieChartIcon,
  Target,
  Trash2,
  Pencil,
  LogOut,
  LogIn,
  Check,
  Star,
  X,
  Paperclip,
  ExternalLink,
  MessageSquare,
  Clock,
  List,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { 
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import { auth, db, loginWithGoogle, logout } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

type TabType = 'dashboard' | 'checklist' | 'planner' | 'shared';

type TaskTag = 'work' | 'study' | 'life' | 'other';

const TASK_TAGS: { id: TaskTag, label: string, color: string }[] = [
  { id: 'work', label: 'Công việc', color: 'bg-brand-blue text-slate-800' },
  { id: 'study', label: 'Học tập', color: 'bg-brand-pink text-slate-800' },
  { id: 'life', label: 'Cuộc sống', color: 'bg-purple-500 text-white' },
  { id: 'other', label: 'Khác', color: 'bg-slate-400 text-white' },
];

interface Attachment {
  id: string;
  url: string;
  name: string;
  type: 'docs' | 'sheet' | 'link' | 'other';
  comment?: string;
}

interface AgendaItem {
  id: string;
  text: string;
  completed: boolean;
  duration?: string;
  details?: string;
  attachments?: Attachment[];
}

interface Event {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: 'blue' | 'pink' | 'purple';
  isShared: boolean;
  sharedNote?: string;
  agenda?: AgendaItem[];
  ownerId: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  date: Date;
  priority: 'low' | 'medium' | 'high';
  tag?: TaskTag;
  customTagLabel?: string;
  isFixed?: boolean;
  fixedUntil?: Date;
  isShared?: boolean;
  sharedNote?: string;
  agenda?: AgendaItem[];
  ownerId: string;
}

interface Note {
  id: string;
  content: string;
  date: Date;
  color: string;
  ownerId: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFirebasePromptVisible, setIsFirebasePromptVisible] = useState(false);
  const [isGuestView, setIsGuestView] = useState(false);
  const [sharedCalendarView, setSharedCalendarView] = useState<'month' | 'week'>('month');
  const [sharedNoteInput, setSharedNoteInput] = useState('');
  const [isSharedItemTask, setIsSharedItemTask] = useState(false);

  // States for real data
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allSharedEvents, setAllSharedEvents] = useState<Event[]>([]);
  const [allSharedTasks, setAllSharedTasks] = useState<Task[]>([]);
  const [sharedDetailDay, setSharedDetailDay] = useState<Date | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTag, setSelectedTag] = useState<TaskTag>('work');
  const [plannerDate, setPlannerDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [plannerTime, setPlannerTime] = useState(format(new Date(), 'HH:mm'));
  const [plannerInputType, setPlannerInputType] = useState<'task' | 'event'>('task');
  const [customTagLabel, setCustomTagLabel] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [fixedUntilDate, setFixedUntilDate] = useState<string>('');
  
  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [agendaInput, setAgendaInput] = useState('');
  const [agendaDuration, setAgendaDuration] = useState('');
  const [agendaHours, setAgendaHours] = useState('');
  const [agendaMinutes, setAgendaMinutes] = useState('');
  const [agendaDetails, setAgendaDetails] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [attachingToId, setAttachingToId] = useState<string | null>(null);
  const [tempAgenda, setTempAgenda] = useState<AgendaItem[]>([]);
  const [newAttName, setNewAttName] = useState('');
  const [newAttUrl, setNewAttUrl] = useState('');
  const [newAttType, setNewAttType] = useState<'docs' | 'sheet' | 'link' | 'other'>('link');

  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Data
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setTasks([]);
      setNotes([]);
    } else {
      // My Events
      const qEvents = query(collection(db, 'events'), where('ownerId', '==', user.uid));
      const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          start: (d.data().start as Timestamp).toDate(),
          end: (d.data().end as Timestamp).toDate(),
        })) as Event[];
        setEvents(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));

      // My Tasks
      const qTasks = query(collection(db, 'tasks'), where('ownerId', '==', user.uid));
      const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          date: (d.data().date as Timestamp).toDate(),
        })) as Task[];
        setTasks(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

      // My Notes
      const qNotes = query(collection(db, 'notes'), where('ownerId', '==', user.uid));
      const unsubscribeNotes = onSnapshot(qNotes, (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          date: (d.data().date as Timestamp).toDate(),
        })) as Note[];
        setNotes(data);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'notes'));

      return () => {
        unsubscribeEvents();
        unsubscribeTasks();
        unsubscribeNotes();
      };
    }
  }, [user]);

  // Sync Shared Events (Always active)
  useEffect(() => {
    const qShared = query(collection(db, 'events'), where('isShared', '==', true));
    const unsubscribeShared = onSnapshot(qShared, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        start: (d.data().start as Timestamp).toDate(),
        end: (d.data().end as Timestamp).toDate(),
      })) as Event[];
      setAllSharedEvents(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));
    return () => unsubscribeShared();
  }, []);

  // Sync Shared Tasks (Always active)
  useEffect(() => {
    const qSharedTasks = query(collection(db, 'tasks'), where('isShared', '==', true));
    const unsubscribeSharedTasks = onSnapshot(qSharedTasks, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        date: (d.data().date as Timestamp).toDate(),
        fixedUntil: d.data().fixedUntil ? (d.data().fixedUntil as Timestamp).toDate() : undefined,
      })) as Task[];
      setAllSharedTasks(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));
    return () => unsubscribeSharedTasks();
  }, []);

  // Firestore Actions
  const addTask = async (customDate?: Date, customTag?: TaskTag, isSharedMode?: boolean, customTitle?: string, initialAgenda?: AgendaItem[]) => {
    const title = customTitle || newTaskTitle;
    if (!user || !title.trim()) return;
    try {
      let finalDate = customDate || selectedDate;
      
      // If we are in planner or provided a date, try to merge with plannerTime if it exists
      if (activeTab === 'planner' || customDate) {
        if (!customDate) { // only if not explicitly provided
          finalDate = new Date(plannerDate + 'T' + plannerTime);
        }
      }

      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), {
          title: title,
          date: Timestamp.fromDate(finalDate),
          tag: selectedTag,
          customTagLabel: selectedTag === 'other' ? customTagLabel : '',
          isFixed: isFixed,
          fixedUntil: isFixed && fixedUntilDate ? Timestamp.fromDate(parseLocalDate(fixedUntilDate)!) : null,
          isShared: isSharedMode || editingTask.isShared || false,
          sharedNote: isSharedMode ? sharedNoteInput : (editingTask.sharedNote || ''),
          agenda: initialAgenda || editingTask.agenda || []
        });
        setEditingTask(null);
        setNewTaskTitle('');
        setIsFixed(false);
        setFixedUntilDate('');
        setCustomTagLabel('');
        setSharedNoteInput('');
        setTempAgenda([]);
        return;
      }

      await addDoc(collection(db, 'tasks'), {
        title: title,
        completed: false,
        date: Timestamp.fromDate(finalDate),
        priority: 'medium',
        tag: customTag || selectedTag || 'other',
        customTagLabel: (customTag === 'other' || selectedTag === 'other') ? customTagLabel : '',
        isFixed: isFixed,
        fixedUntil: isFixed && fixedUntilDate ? Timestamp.fromDate(parseLocalDate(fixedUntilDate)!) : null,
        isShared: isSharedMode || false,
        sharedNote: isSharedMode ? sharedNoteInput : '',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        agenda: initialAgenda || []
      });
      setNewTaskTitle('');
      setCustomTagLabel('');
      setIsFixed(false);
      setFixedUntilDate('');
      setSharedNoteInput('');
      setTempAgenda([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  };

  const startEditing = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setPlannerDate(format(task.date, 'yyyy-MM-dd'));
    setPlannerTime(format(task.date, 'HH:mm'));
    setSelectedTag(task.tag || 'other');
    setCustomTagLabel(task.customTagLabel || '');
    setIsFixed(task.isFixed || false);
    setFixedUntilDate(task.fixedUntil ? format(task.fixedUntil, 'yyyy-MM-dd') : '');
    setPlannerInputType('task');
    setActiveTab('planner');
  };

  const toggleTask = async (task: Task) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const addAgendaItem = async (itemId: string, itemType: 'task' | 'event') => {
    if (!agendaInput.trim()) return;
    
    let durationStr = '';
    if (agendaHours || agendaMinutes) {
      if (agendaHours) durationStr += `${agendaHours}h `;
      if (agendaMinutes) durationStr += `${agendaMinutes}p`;
    }
    durationStr = durationStr.trim() || agendaDuration;

    const newItem: AgendaItem = { 
      id: crypto.randomUUID(), 
      text: agendaInput.trim(), 
      duration: durationStr || undefined,
      details: agendaDetails || undefined,
      completed: false,
      attachments: []
    };
    const collectionName = itemType === 'task' ? 'tasks' : 'events';
    const targetItem = itemType === 'task' ? allSharedTasks.concat(tasks).find(t => t.id === itemId) : allSharedEvents.concat(events).find(e => e.id === itemId);
    
    if (!targetItem) return;

    try {
      await updateDoc(doc(db, collectionName, itemId), {
        agenda: [...(targetItem.agenda || []), newItem]
      });
      setAgendaInput('');
      setAgendaDuration('');
      setAgendaHours('');
      setAgendaMinutes('');
      setAgendaDetails('');
      setActiveItemId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${itemId}`);
    }
  };

  const addAttachment = async (itemId: string, itemType: 'task' | 'event', agendaId: string, attachment: Omit<Attachment, 'id'>) => {
    const collectionName = itemType === 'task' ? 'tasks' : 'events';
    const targetItem = itemType === 'task' ? allSharedTasks.concat(tasks).find(t => t.id === itemId) : allSharedEvents.concat(events).find(e => e.id === itemId);
    
    if (!targetItem || !targetItem.agenda) return;

    const newAgenda = targetItem.agenda.map(item => {
      if (item.id === agendaId) {
        return {
          ...item,
          attachments: [...(item.attachments || []), { ...attachment, id: crypto.randomUUID() }]
        };
      }
      return item;
    });

    try {
      await updateDoc(doc(db, collectionName, itemId), { agenda: newAgenda });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${itemId}`);
    }
  };

  const updateAttachmentComment = async (itemId: string, itemType: 'task' | 'event', agendaId: string, attachmentId: string, comment: string) => {
    const collectionName = itemType === 'task' ? 'tasks' : 'events';
    const targetItem = itemType === 'task' ? allSharedTasks.concat(tasks).find(t => t.id === itemId) : allSharedEvents.concat(events).find(e => e.id === itemId);
    
    if (!targetItem || !targetItem.agenda) return;

    const newAgenda = targetItem.agenda.map(item => {
      if (item.id === agendaId) {
        return {
          ...item,
          attachments: item.attachments?.map(att => att.id === attachmentId ? { ...att, comment } : att)
        };
      }
      return item;
    });

    try {
      await updateDoc(doc(db, collectionName, itemId), { agenda: newAgenda });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${itemId}`);
    }
  };

  const toggleAgendaItem = async (itemId: string, itemType: 'task' | 'event', agendaId: string) => {
    const collectionName = itemType === 'task' ? 'tasks' : 'events';
    const targetItem = itemType === 'task' ? allSharedTasks.concat(tasks).find(t => t.id === itemId) : allSharedEvents.concat(events).find(e => e.id === itemId);
    
    if (!targetItem || !targetItem.agenda) return;

    const newAgenda = targetItem.agenda.map(item => 
      item.id === agendaId ? { ...item, completed: !item.completed } : item
    );

    try {
      await updateDoc(doc(db, collectionName, itemId), {
        agenda: newAgenda
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${itemId}`);
    }
  };

  const deleteAgendaItem = async (itemId: string, itemType: 'task' | 'event', agendaId: string) => {
    const collectionName = itemType === 'task' ? 'tasks' : 'events';
    const targetItem = itemType === 'task' ? allSharedTasks.concat(tasks).find(t => t.id === itemId) : allSharedEvents.concat(events).find(e => e.id === itemId);
    
    if (!targetItem || !targetItem.agenda) return;

    const newAgenda = targetItem.agenda.filter(item => item.id !== agendaId);

    try {
      await updateDoc(doc(db, collectionName, itemId), {
        agenda: newAgenda
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${itemId}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
    }
  };

  const addNote = async () => {
    if (!user || !newNoteContent.trim()) return;
    try {
      await addDoc(collection(db, 'notes'), {
        content: newNoteContent,
        date: Timestamp.fromDate(new Date()),
        color: '#AEE1F9',
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });
      setNewNoteContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notes');
    }
  };

  const addEvent = async (customStart?: Date, customEnd?: Date, customTitle?: string, customColor?: 'blue' | 'pink' | 'purple', isSharedView?: boolean, initialAgenda?: AgendaItem[]) => {
    const title = customTitle || newEventTitle;
    if (!user || !title.trim()) return;
    try {
      await addDoc(collection(db, 'events'), {
        title: title,
        start: Timestamp.fromDate(customStart || selectedDate),
        end: Timestamp.fromDate(customEnd || customStart || selectedDate),
        color: customColor || 'pink',
        isShared: isSharedView || false,
        sharedNote: isSharedView ? sharedNoteInput : '',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        agenda: initialAgenda || []
      });
      setNewEventTitle('');
      setSharedNoteInput('');
      setIsEventModalOpen(false);
      setTempAgenda([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'events');
    }
  };

  const deleteEvent = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${id}`);
    }
  };

  const addToTempAgenda = () => {
    if (!agendaInput.trim()) return;

    let durationStr = '';
    if (agendaHours || agendaMinutes) {
      if (agendaHours) durationStr += `${agendaHours}h `;
      if (agendaMinutes) durationStr += `${agendaMinutes}p`;
    }
    durationStr = durationStr.trim() || agendaDuration;

    const newItem: AgendaItem = {
      id: crypto.randomUUID(),
      text: agendaInput.trim(),
      duration: durationStr || undefined,
      details: agendaDetails || undefined,
      completed: false,
      attachments: []
    };
    setTempAgenda([...tempAgenda, newItem]);
    setAgendaInput('');
    setAgendaHours('');
    setAgendaMinutes('');
    setAgendaDetails('');
    setAgendaDuration('');
  };

  const addAttachmentToTempAgenda = (agendaId: string, attachment: Omit<Attachment, 'id'>) => {
    setTempAgenda(tempAgenda.map(item => {
      if (item.id === agendaId) {
        return {
          ...item,
          attachments: [...(item.attachments || []), { ...attachment, id: crypto.randomUUID() }]
        };
      }
      return item;
    }));
  };

  const updateTempAttachmentComment = (agendaId: string, attachmentId: string, comment: string) => {
    setTempAgenda(tempAgenda.map(item => {
      if (item.id === agendaId) {
        return {
          ...item,
          attachments: item.attachments?.map(att => att.id === attachmentId ? { ...att, comment } : att)
        };
      }
      return item;
    }));
  };

  // Check URL for guest view
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'guest') {
      setIsGuestView(true);
      setActiveTab('shared');
    }
  }, []);

  // Calendar Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: endDate,
    });
  }, [startDate, endDate]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  // Checklist Stats
  const dayTasks = tasks.filter(t => 
    isSameDay(t.date, selectedDate) || 
    (t.isFixed && t.date.getDay() === selectedDate.getDay() && startOfDay(t.date) <= startOfDay(selectedDate) && (!t.fixedUntil || startOfDay(selectedDate) <= startOfDay(t.fixedUntil)))
  ).sort((a, b) => {
    // Sort by time of day
    const timeA = a.date.getHours() * 60 + a.date.getMinutes();
    const timeB = b.date.getHours() * 60 + b.date.getMinutes();
    return timeA - timeB;
  });
  const completedCount = dayTasks.filter(t => t.completed).length;
  const progressData = useMemo(() => {
    return [
      { name: 'Xong', value: completedCount, color: '#F9A8C4' },
      { name: 'Đang làm', value: dayTasks.length - completedCount, color: '#AEE1F9' },
    ].filter(d => d.value > 0);
  }, [completedCount, dayTasks.length]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFCFB]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-16 h-16 bg-brand-blue rounded-2xl flex items-center justify-center shadow-2xl shadow-brand-blue/30"
        >
          <CalendarIcon className="text-slate-800 w-8 h-8" />
        </motion.div>
      </div>
    );
  }

  if (!user && !isGuestView) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-brand-blue rounded-3xl flex items-center justify-center shadow-2xl shadow-brand-blue/30 mx-auto mb-8">
            <CalendarIcon className="text-slate-800 w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight leading-tight">MySchedule</h1>
          <h2 className="text-xl font-bold text-slate-700 mb-4">Kế hoạch sẻ chia</h2>
          <p className="text-slate-500 mb-10 font-medium leading-relaxed">Đăng nhập để bắt đầu xây dựng và chia sẻ lịch trình của bạn với những người thân yêu.</p>
          <button 
            onClick={loginWithGoogle}
            className="flex items-center justify-center gap-3 w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl active:scale-95 group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            <span>Tiếp tục với Google</span>
          </button>
          <button 
            onClick={() => setIsGuestView(true)}
            className="mt-4 text-xs font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
          >
             Xem lịch cộng đồng
          </button>
        </div>
      </div>
    );
  }

  const renderAgendaTable = (itemId: string, itemType: 'task' | 'event', agenda: AgendaItem[], ownerId: string, showAddButton: boolean = true) => {
    const isOwner = user?.uid === ownerId;
    const accentColor = itemType === 'task' ? 'brand-blue' : 'brand-pink';

    return (
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-[10px] text-left border-collapse">
          <thead>
            <tr className={cn("border-b border-slate-50", itemType === 'task' ? "bg-brand-blue/5" : "bg-brand-pink/5")}>
              <th className="px-3 py-2 font-black uppercase tracking-widest text-slate-400 w-10">STT</th>
              <th className="px-3 py-2 font-black uppercase tracking-widest text-slate-400 w-24"><div className="flex items-center gap-1"><Clock className="w-3 h-3" /> Thời lượng</div></th>
              <th className="px-3 py-2 font-black uppercase tracking-widest text-slate-400 min-w-[120px]"><div className="flex items-center gap-1"><List className="w-3 h-3" /> Công việc</div></th>
              <th className="px-3 py-2 font-black uppercase tracking-widest text-slate-400 min-w-[150px]">Chi tiết</th>
              <th className="px-3 py-2 font-black uppercase tracking-widest text-slate-400">Đính kèm</th>
              {isOwner && showAddButton && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {agenda?.map((item, index) => (
              <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group/row">
                <td className="px-3 py-3 text-slate-400 font-bold">{index + 1}</td>
                <td className="px-3 py-3 font-medium text-slate-600">{item.duration || '-'}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleAgendaItem(itemId, itemType, item.id)}
                      className={cn(
                        "w-4 h-4 flex items-center justify-center transition-all shrink-0",
                        item.completed ? `text-amber-400 scale-110` : "text-slate-300 hover:text-amber-200"
                      )}
                    >
                      <Star className={cn("w-4 h-4", item.completed ? "fill-amber-400" : "fill-none")} strokeWidth={2.5} />
                    </button>
                    <span className={cn("font-bold text-slate-800", item.completed && "line-through opacity-50")}>{item.text}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                   <p className="text-slate-500 line-clamp-2">{item.details || '-'}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="space-y-1">
                    {item.attachments?.map(att => (
                      <div key={att.id} className="group/att">
                        <div className="flex items-center gap-2">
                           <a 
                             href={att.url} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className={cn("flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[8px] font-bold transition-all", 
                               att.type === 'docs' ? "bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100" :
                               att.type === 'sheet' ? "bg-green-50 border-green-100 text-green-600 hover:bg-green-100" :
                               "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                             )}
                           >
                             {att.type === 'docs' && <Paperclip className="w-2.5 h-2.5" />}
                             {att.type === 'sheet' && <List className="w-2.5 h-2.5" />}
                             <span className="truncate max-w-[80px]">{att.name}</span>
                             <ExternalLink className="w-2 h-2 opacity-50" />
                           </a>
                           {att.comment && (
                             <div className="text-[7px] text-slate-400 flex items-center gap-1 max-w-[100px] truncate">
                               <MessageSquare className="w-2 h-2" /> {att.comment}
                             </div>
                           )}
                           {isOwner && showAddButton && (
                             <button 
                               onClick={() => {
                                 const cmt = prompt('Nhập comment cho tệp đính kèm:', att.comment || '');
                                 if (cmt !== null) updateAttachmentComment(itemId, itemType, item.id, att.id, cmt);
                               }}
                               className="opacity-0 group-hover/att:opacity-100 p-1 text-slate-300 hover:text-brand-blue"
                             >
                               <MessageSquare className="w-2.5 h-2.5" />
                             </button>
                           )}
                        </div>
                      </div>
                    ))}
                    {isOwner && showAddButton && (
                      attachingToId === item.id ? (
                        <div className="p-2 space-y-2 bg-slate-50 rounded-lg animate-in fade-in slide-in-from-top-1">
                          <input 
                            type="text" 
                            placeholder="Tên tệp..." 
                            className="w-full p-1 bg-white border border-slate-200 rounded text-[8px]" 
                            value={newAttName} 
                            onChange={(e) => setNewAttName(e.target.value)}
                          />
                          <input 
                            type="text" 
                            placeholder="URL (link, docs, sheet...)" 
                            className="w-full p-1 bg-white border border-slate-200 rounded text-[8px]" 
                            value={newAttUrl} 
                            onChange={(e) => setNewAttUrl(e.target.value)}
                          />
                          <div className="flex gap-1">
                            {(['link', 'docs', 'sheet'] as const).map(t => (
                              <button 
                                key={t}
                                onClick={() => setNewAttType(t)}
                                className={cn("px-1.5 py-0.5 rounded text-[7px] font-black uppercase",
                                  newAttType === t ? `bg-${accentColor} text-white` : "bg-white text-slate-400 border border-slate-100"
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <button 
                              onClick={async () => {
                                if (!newAttName || !newAttUrl) return;
                                await addAttachment(itemId, itemType, item.id, { 
                                  name: newAttName, 
                                  url: newAttUrl, 
                                  type: newAttType 
                                });
                                setNewAttName('');
                                setNewAttUrl('');
                                setAttachingToId(null);
                              }}
                              className={cn("flex-1 py-1 rounded text-white font-bold", `bg-${accentColor}`)}
                            >
                              Lưu
                            </button>
                            <button onClick={() => setAttachingToId(null)} className="px-2 py-1 bg-slate-200 text-slate-500 rounded font-bold">Hủy</button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setAttachingToId(item.id)} 
                          className="text-[9px] text-slate-400 hover:text-brand-blue font-black flex items-center gap-1 uppercase tracking-widest bg-slate-50 border border-slate-100 px-2 py-1 rounded-md transition-all hover:border-slate-200"
                        >
                          <Plus className="w-3 h-3" /> Tệp
                        </button>
                      )
                    )}
                  </div>
                </td>
                {isOwner && showAddButton && (
                  <td className="px-3 py-3">
                    <button onClick={() => deleteAgendaItem(itemId, itemType, item.id)} className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {isOwner && showAddButton && activeItemId === itemId && (
              <tr className="bg-slate-50/50">
                <td className="px-3 py-4"></td>
                <td className="px-3 py-4">
                  <div className="flex items-center gap-0.5">
                    <input 
                      type="number" 
                      placeholder="H" 
                      min="0"
                      className="w-7 bg-white border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-bold focus:outline-none"
                      value={agendaHours}
                      onChange={(e) => setAgendaHours(e.target.value)}
                    />
                    <span className="text-[8px] text-slate-400 font-bold">h</span>
                    <input 
                      type="number" 
                      placeholder="M" 
                      min="0" 
                      max="59"
                      className="w-8 bg-white border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-bold focus:outline-none"
                      value={agendaMinutes}
                      onChange={(e) => setAgendaMinutes(e.target.value)}
                    />
                    <span className="text-[8px] text-slate-400 font-bold">p</span>
                  </div>
                </td>
                <td className="px-3 py-4">
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Công việc..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] focus:outline-none"
                    value={agendaInput}
                    onChange={(e) => setAgendaInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAgendaItem(itemId, itemType)}
                  />
                </td>
                <td className="px-3 py-4">
                  <textarea 
                    placeholder="Nội dung chi tiết..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] focus:outline-none min-h-[40px] resize-none"
                    value={agendaDetails}
                    onChange={(e) => setAgendaDetails(e.target.value)}
                  />
                </td>
                <td className="px-3 py-4">
                  <p className="text-[8px] text-slate-400 italic">Thêm tệp sau khi lưu mục này</p>
                </td>
                <td className="px-3 py-4">
                  <div className="flex gap-1">
                    <button onClick={() => addAgendaItem(itemId, itemType)} className={cn("p-1.5 text-white rounded-lg", `bg-${accentColor}`)}>
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setActiveItemId(null); setAgendaInput(''); setAgendaDuration(''); setAgendaDetails(''); }} className="p-1.5 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!activeItemId && isOwner && showAddButton && (
          <div className="p-4 flex justify-center border-t border-slate-50 bg-slate-50/30">
             <button 
               onClick={() => setActiveItemId(itemId)}
               className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-lg", `bg-${accentColor} text-white shadow-${accentColor}/20`)}
             >
               <Plus className="w-4 h-4" /> Thêm
             </button>
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="lg:col-span-9">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-3xl font-black text-slate-800 lowercase first-letter:uppercase">
              {format(currentDate, 'MMMM yyyy', { locale: vi })}
            </h2>
            <p className="text-slate-400 text-sm font-medium mt-1">
              Hôm nay là {format(new Date(), 'EEEE, do MMMM', { locale: vi })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-colors">Hôm nay</button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4">
          <div className="calendar-grid mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">{day}</div>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isDateToday(day);
              
              const dayEvents = events.filter(e => isSameDay(e.start, day));
              const dayTasksForCalendar = tasks.filter(t => 
                isSameDay(t.date, day) || 
                (t.isFixed && t.date.getDay() === day.getDay() && startOfDay(t.date) <= startOfDay(day) && (!t.fixedUntil || startOfDay(day) <= startOfDay(t.fixedUntil)))
              );

              const dayItems = [
                ...dayEvents.map(e => ({ ...e, type: 'event' as const })),
                ...dayTasksForCalendar.map(t => ({ id: t.id, title: t.title, type: 'task' as const, completed: t.completed, tag: t.tag }))
              ];

              return (
                <motion.div
                  key={day.toString()}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.005 }}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "relative aspect-square p-2 border border-slate-50 cursor-pointer group transition-all",
                    !isCurrentMonth && "bg-slate-50/30 grayscale opacity-40",
                    isSelected && "bg-slate-50/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-xl text-sm font-bold transition-all",
                    isToday && "bg-brand-blue text-slate-800 shadow-lg shadow-brand-blue/30 scale-110",
                    isSelected && !isToday && "bg-slate-900 text-white shadow-lg shadow-slate-900/30 scale-110",
                    !isSelected && !isToday && "text-slate-600 group-hover:bg-slate-100"
                  )}>
                    {format(day, 'd')}
                  </div>
                  <div className="mt-1 space-y-1 overflow-y-auto max-h-20 scrollbar-hide">
                    {dayItems.slice(0, 8).map((item, i) => (
                      <div key={`${item.type}-${item.id}`} className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate tracking-tight shadow-sm border",
                        item.type === 'event' 
                          ? "bg-brand-blue/20 text-brand-blue border-brand-blue/20" 
                          : item.completed 
                            ? "bg-slate-100 text-slate-400 border-slate-200"
                            : "bg-brand-pink/20 text-brand-pink border-brand-pink/20"
                      )}>
                        {item.type === 'task' && '• '}{item.title}
                      </div>
                    ))}
                    {dayItems.length > 8 && <div className="text-[7px] font-black text-slate-400 text-center">+{dayItems.length - 8}</div>}
                  </div>
                  {isSelected && <motion.div layoutId="selection" className="absolute inset-0 border-2 border-slate-900 rounded-2xl pointer-events-none" />}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderChecklist = () => (
    <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Việc cần làm</h2>
            <div className="relative group inline-block">
              <div className="flex items-center gap-2 text-slate-400 text-sm font-medium group-hover:text-brand-blue transition-colors pointer-events-none">
                <span>{format(selectedDate, 'EEEE, d/MM', { locale: vi })}</span>
                <CalendarIcon className="w-3.5 h-3.5" />
              </div>
              <input 
                type="date" 
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) setSelectedDate(d);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                onClick={(e) => (e.target as any).showPicker?.()}
              />
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('planner')} 
            className="w-10 h-10 bg-brand-pink/10 text-brand-pink rounded-xl flex items-center justify-center hover:bg-brand-pink hover:text-slate-800 transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {dayTasks.map(task => (
              <motion.div layout key={task.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border transition-all group",
                task.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-100 shadow-sm"
              )}>
                <button 
                  onClick={() => toggleTask(task)}
                  className={cn("p-1 transition-all hover:scale-110 active:scale-95", task.completed ? "text-amber-400" : "text-slate-200 hover:text-amber-200")}
                >
                  <Star className={cn("w-6 h-6", task.completed ? "fill-amber-400" : "fill-none")} strokeWidth={2.5} />
                </button>
                <div className="flex-1">
                   <div className="text-sm font-bold text-slate-700">
                     <span className="text-[10px] text-brand-blue font-black mr-2 opacity-50">{format(task.date, 'HH:mm')}</span>
                     {task.title}
                   </div>
                   {task.tag && (
                     <div className={cn(
                       "inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md mt-1",
                       TASK_TAGS.find(t => t.id === task.tag)?.color || "bg-slate-100 text-slate-400"
                     )}>
                       {task.tag === 'other' ? (task.customTagLabel || 'Khác') : TASK_TAGS.find(t => t.id === task.tag)?.label}
                       {task.isFixed && <span className="ml-2 opacity-50 tracking-normal text-[7px] font-medium">(Cố định)</span>}
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => startEditing(task)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-brand-blue transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {dayTasks.length === 0 && (
            <div className="text-center py-10">
              <p className="text-slate-300 text-sm italic mb-4">Hôm nay chưa có lịch trình...</p>
              <button 
                onClick={() => setActiveTab('planner')}
                className="text-xs font-black text-brand-blue uppercase tracking-widest hover:underline"
              >
                + Lên kế hoạch ngay
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl relative overflow-hidden">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 relative z-10"><PieChartIcon className="w-5 h-5 text-brand-pink" />Tiến độ</h3>
          <div className="h-[200px] w-full flex items-center justify-center relative z-10">
            {progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={progressData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {progressData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-slate-300 text-xs italic">Chưa có dữ liệu</p>}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-800">{dayTasks.length > 0 ? Math.round((completedCount/dayTasks.length)*100) : 0}%</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Done</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><StickyNote className="w-5 h-5 text-brand-blue" />Ghi chú</h3>
          <div className="space-y-4">
            <div className="relative">
              <textarea 
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Nhập ghi chú mới..."
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-medium focus:outline-none focus:border-brand-blue/50 resize-none h-24 mb-2"
              />
              <button 
                onClick={addNote}
                className="w-full p-3 rounded-xl bg-brand-blue text-slate-800 text-xs font-black uppercase tracking-widest hover:bg-brand-blue/80 shadow-sm mb-4"
              >
                Ghi chú lại
              </button>
            </div>
            {notes.map(note => (
              <motion.div key={note.id} className="p-4 rounded-2xl bg-brand-blue/10 border border-brand-blue/10 shadow-inner">
                <p className="text-sm text-slate-700 font-semibold leading-relaxed">{note.content}</p>
                <p className="text-[9px] text-slate-400 mt-2 font-black uppercase tracking-widest">{format(note.date, 'dd MMM, yyyy', { locale: vi })}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPlanner = () => (
    <div className="lg:col-span-9">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden md:flex">
        <div className="md:w-1/3 bg-slate-50 p-8 border-r border-slate-100 flex flex-col justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Lên kế hoạch</h2>
            <p className="text-slate-500 text-sm font-medium mb-8">Kế hoạch thông minh theo nhãn dán.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Ngày dự kiến</label>
                <input 
                  type="date" 
                  value={plannerDate}
                  onChange={(e) => setPlannerDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand-blue/50 shadow-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Giờ thực hiện</label>
                <input 
                  type="time" 
                  value={plannerTime}
                  onChange={(e) => setPlannerTime(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand-blue/50 shadow-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 block">Chọn Nhãn</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {TASK_TAGS.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTag(tag.id)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 text-center",
                        selectedTag === tag.id 
                          ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                      )}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
                
                {selectedTag === 'other' && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <input 
                      type="text"
                      placeholder="Tên nhãn tùy chỉnh..."
                      value={customTagLabel}
                      onChange={(e) => setCustomTagLabel(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus:border-brand-blue/50"
                    />
                  </motion.div>
                )}
              </div>

              <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <button 
                  onClick={() => setIsFixed(!isFixed)}
                  className={cn(
                    "w-10 h-6 rounded-full transition-all relative",
                    isFixed ? "bg-brand-blue" : "bg-slate-200"
                  )}
                >
                   <div className={cn(
                     "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all",
                     isFixed ? "translate-x-4" : "translate-x-0"
                   )} />
                </button>
                <div className="flex-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Lịch cố định</p>
                   <p className="text-[9px] text-slate-400 font-medium">Tự động lặp lại mỗi tuần.</p>
                </div>
                <div className="p-1.5 bg-slate-50 rounded-lg">
                   <Target className="w-3 h-3 text-slate-400" />
                </div>
              </div>

              {isFixed && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Lặp lại đến ngày (Tùy chọn)</label>
                  <input 
                    type="date" 
                    value={fixedUntilDate}
                    onChange={(e) => setFixedUntilDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand-blue/50 shadow-sm"
                  />
                  <p className="text-[9px] text-slate-400 font-medium px-1 italic">Để trống nếu muốn lặp lại vô thời hạn.</p>
                </motion.div>
              )}

              <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <button 
                  onClick={() => setIsSharedItemTask(!isSharedItemTask)}
                  className={cn(
                    "w-10 h-6 rounded-full transition-all relative",
                    isSharedItemTask ? "bg-brand-pink" : "bg-slate-200"
                  )}
                >
                   <div className={cn(
                     "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all",
                     isSharedItemTask ? "translate-x-4" : "translate-x-0"
                   )} />
                </button>
                <div className="flex-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Chia sẻ lịch</p>
                   <p className="text-[9px] text-slate-400 font-medium">Hiện ở phần Tổng quan chung.</p>
                </div>
                <div className="p-1.5 bg-slate-50 rounded-lg">
                   <Share2 className="w-3 h-3 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
             <div className="p-4 rounded-2xl bg-brand-blue/10 border border-brand-blue/10">
                <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-1">Mẹo nhỏ</p>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">Công việc được lên kế hoạch tại đây sẽ tự động hiển thị trong Checklist ngày tương ứng.</p>
             </div>
          </div>
        </div>

        <div className="flex-1 p-8">
          <div className="mb-10">
              <div className="flex items-center gap-2 mb-6 p-1 bg-slate-100 rounded-2xl w-fit">
                <button 
                  onClick={() => setPlannerInputType('task')}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    plannerInputType === 'task' ? "bg-white text-brand-blue shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Công việc
                </button>
                <button 
                  onClick={() => {
                    setPlannerInputType('event');
                    setEditingTask(null);
                  }}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    plannerInputType === 'event' ? "bg-white text-brand-pink shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Sự kiện
                </button>
              </div>

              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (plannerInputType === 'task') {
                        addTask(new Date(`${plannerDate}T${plannerTime}`), selectedTag, isSharedItemTask);
                      } else {
                        addEvent(new Date(`${plannerDate}T${plannerTime}`), new Date(`${plannerDate}T${plannerTime}`), newTaskTitle, 'blue', isSharedItemTask);
                        setNewTaskTitle('');
                      }
                    }
                  }}
                  placeholder={
                    editingTask 
                      ? "Đang cập nhật công việc..." 
                      : plannerInputType === 'task' 
                        ? "Hôm đó bạn sẽ làm gì?..." 
                        : "Sự kiện sắp diễn ra là gì?..."
                  }
                  className={cn(
                    "flex-1 border rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none transition-all",
                    editingTask 
                      ? "bg-amber-50 border-amber-200 focus:border-amber-400" 
                      : plannerInputType === 'event'
                        ? "bg-brand-pink/5 border-slate-100 focus:border-brand-pink/50"
                        : "bg-slate-50 border-slate-100 focus:border-brand-blue/50"
                  )}
                />
                <button 
                  onClick={async () => {
                     if (plannerInputType === 'task') {
                       addTask(new Date(`${plannerDate}T${plannerTime}`), selectedTag, isSharedItemTask);
                     } else {
                       addEvent(new Date(`${plannerDate}T${plannerTime}`), new Date(`${plannerDate}T${plannerTime}`), newTaskTitle, 'blue', isSharedItemTask);
                       setNewTaskTitle('');
                     }
                  }}
                  className={cn(
                    "px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl transition-all active:scale-95",
                    editingTask 
                      ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20" 
                      : plannerInputType === 'event'
                        ? "bg-brand-pink text-slate-800 hover:bg-brand-pink/80 shadow-brand-pink/20"
                        : "bg-brand-blue text-slate-800 hover:bg-brand-blue/80 shadow-brand-blue/20"
                  )}
                >
                  {editingTask ? 'Cập Nhật' : 'Lưu vào lịch'}
                </button>
              </div>
           </div>

           <div>
              <div className="mb-10">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Sự kiện trong ngày ({format(parseLocalDate(plannerDate) || new Date(), 'dd/MM')})</h3>
                <div className="space-y-3">
                  {events.filter(e => isSameDay(e.start, parseLocalDate(plannerDate) || new Date())).map(event => (
                    <div key={event.id} className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-shadow group shadow-sm",
                      event.color === 'blue' ? "bg-brand-blue/5 border-brand-blue/10" : "bg-brand-pink/5 border-brand-pink/10"
                    )}>
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-sm font-bold text-slate-700">{event.title}</p>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-0.5">
                            {format(event.start, 'HH:mm')} • Sự kiện
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {events.filter(e => isSameDay(e.start, parseLocalDate(plannerDate) || new Date())).length === 0 && (
                    <p className="text-[10px] text-slate-300 italic font-bold uppercase tracking-widest text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">Không có sự kiện nào...</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest ">Công việc đã lên lịch</h3>
                {editingTask && (
                  <button 
                    onClick={() => {
                      setEditingTask(null);
                      setNewTaskTitle('');
                      setIsFixed(false);
                      setPlannerDate(format(new Date(), 'yyyy-MM-dd'));
                    }}
                    className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                  >
                    Hủy chỉnh sửa
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {(() => {
                  const dayDate = parseLocalDate(plannerDate) || new Date();
                  const dayTasksList = tasks.filter(t => 
                    !t.completed && (
                      isSameDay(t.date, dayDate) || 
                      (t.isFixed && t.date.getDay() === dayDate.getDay() && startOfDay(t.date) <= startOfDay(dayDate) && (!t.fixedUntil || startOfDay(dayDate) <= startOfDay(t.fixedUntil)))
                    )
                  ).sort((a,b) => b.date.getTime() - a.date.getTime());

                  return dayTasksList.length > 0 ? dayTasksList.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow group">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-2 h-10 rounded-full",
                          TASK_TAGS.find(t => t.id === task.tag)?.color.split(' ')[0] || "bg-slate-200"
                        )} />
                        <div>
                          <div className="flex items-center gap-2">
                             <p className="text-sm font-bold text-slate-700">{task.title}</p>
                             {task.isFixed && (
                               <span className="text-[8px] bg-brand-blue/20 text-brand-blue px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter flex items-center gap-1">
                                 Fixed {task.fixedUntil && `đến ${format(task.fixedUntil, 'dd/MM/yy')}`}
                               </span>
                             )}
                          </div>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-0.5">
                            {format(task.date, 'HH:mm')} • {format(task.date, 'dd/MM/yyyy')} • {task.tag === 'other' ? (task.customTagLabel || 'Khác') : TASK_TAGS.find(t => t.id === task.tag)?.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => startEditing(task)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-brand-blue transition-all"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-10 opacity-30 italic text-sm">Chưa có kế hoạch nào được lập cho ngày này...</div>
                  );
                })()}
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderShared = () => (
    <div className="lg:col-span-9 space-y-8">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {sharedDetailDay && (
              <button 
                onClick={() => setSharedDetailDay(null)}
                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div>
              <h2 className="text-3xl font-black tracking-tight">
                {sharedDetailDay ? `Chi tiết: ${format(sharedDetailDay, 'dd/MM/yyyy')}` : 'Shared Schedule'}
              </h2>
              <p className="text-slate-400 text-sm font-medium mt-1">
                {sharedDetailDay ? 'Lên kế hoạch cụ thể cho ngày này' : 'Lên kế hoạch và gửi gắm những lời nhắn nhủ.'}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 p-1 rounded-2xl border border-white/10">
            <button 
              onClick={() => { setSharedCalendarView('month'); setSharedDetailDay(null); }}
              className={cn(
                "px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                sharedCalendarView === 'month' && !sharedDetailDay ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
              )}
            >
              Tháng
            </button>
            <button 
              onClick={() => { setSharedCalendarView('week'); setSharedDetailDay(null); }}
              className={cn(
                "px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                sharedCalendarView === 'week' && !sharedDetailDay ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
              )}
            >
              Tuần
            </button>
          </div>
        </div>
        
        {user && !isGuestView && (
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Thêm lịch trình chia sẻ ({sharedDetailDay ? format(sharedDetailDay, 'dd/MM') : format(selectedDate, 'dd/MM')})</h3>
            
            <div className="flex items-center gap-2 mb-6 p-1 bg-slate-200 rounded-2xl w-fit">
              <button 
                onClick={() => setIsSharedItemTask(false)}
                className={cn(
                  "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  !isSharedItemTask ? "bg-white text-brand-pink shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Sự kiện
              </button>
              <button 
                onClick={() => setIsSharedItemTask(true)}
                className={cn(
                  "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  isSharedItemTask ? "bg-white text-brand-blue shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Công việc
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Tên {isSharedItemTask ? 'công việc' : 'sự kiện'}</label>
                  <input 
                    type="text" 
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    placeholder={isSharedItemTask ? "Ví dụ: Hoàn thiện report..." : "Ví dụ: Đi ăn tối cùng nhau..."}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:border-slate-400"
                  />
                </div>
                {!sharedDetailDay && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Ngày</label>
                      <input 
                        type="date" 
                        value={format(selectedDate, 'yyyy-MM-dd')}
                        onChange={(e) => setSelectedDate(new Date(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                )}
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Giờ</label>
                  <input 
                    type="time" 
                    value={plannerTime}
                    onChange={(e) => setPlannerTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Lời nhắn gửi kèm</label>
                  <textarea 
                    value={sharedNoteInput}
                    onChange={(e) => setSharedNoteInput(e.target.value)}
                    placeholder="Chờ bạn ở chỗ cũ nhé..."
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-medium focus:outline-none h-[116px] resize-none mb-4"
                  />
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl">
                      <button 
                        onClick={() => setIsFixed(!isFixed)}
                        className={cn(
                          "w-10 h-6 rounded-full transition-all relative",
                          isFixed ? "bg-brand-blue" : "bg-slate-200"
                        )}
                      >
                         <div className={cn(
                           "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all",
                           isFixed ? "translate-x-4" : "translate-x-0"
                         )} />
                      </button>
                      <div className="flex-1">
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Lịch cố định</p>
                         <p className="text-[9px] text-slate-400 font-medium">Tự động lặp lại mỗi tuần.</p>
                      </div>
                    </div>

                    {isFixed && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Đến ngày</label>
                        <input 
                          type="date" 
                          value={fixedUntilDate}
                          onChange={(e) => setFixedUntilDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2 text-xs font-bold focus:outline-none focus:border-brand-blue/50"
                        />
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* In-form Agenda Builder */}
            {sharedDetailDay && (
              <div className="mt-8 bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm overflow-hidden anim-pop">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <List className="w-4 h-4 text-brand-blue" /> Agenda cho {isSharedItemTask ? 'công việc' : 'sự kiện'}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Lập kế hoạch tiết tấu cho hoạt động của bạn</p>
                  </div>
                  {tempAgenda.length > 0 && (
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      {tempAgenda.length} mục
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-50 text-slate-400 font-black uppercase tracking-widest text-[10px]">
                        <th className="px-3 py-3 w-10">STT</th>
                        <th className="px-3 py-3 w-32">Thời lượng</th>
                        <th className="px-3 py-3 min-w-[150px]">Công việc</th>
                        <th className="px-3 py-3 min-w-[150px]">Chi tiết</th>
                        <th className="px-3 py-3 w-32">Đính kèm</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tempAgenda.map((item, i) => (
                        <tr key={item.id} className="border-b border-slate-50 group">
                          <td className="px-3 py-4 text-slate-400 font-bold">{i + 1}</td>
                          <td className="px-3 py-4 text-slate-600 font-bold">{item.duration || '-'}</td>
                          <td className="px-3 py-4 text-slate-800 font-extrabold">{item.text}</td>
                          <td className="px-3 py-4 text-slate-500 italic text-[11px] font-medium leading-relaxed">{item.details || '-'}</td>
                          <td className="px-3 py-4">
                             <div className="space-y-1">
                                {item.attachments?.map(att => (
                                  <div key={att.id} className="group/att">
                                    <div className="flex items-center gap-1 text-[8px] font-black bg-slate-50 border border-slate-100 p-1 rounded-md text-slate-600">
                                       <Paperclip className="w-2 h-2 shrink-0" />
                                       <span className="truncate">{att.name}</span>
                                    </div>
                                  </div>
                                ))}
                                {attachingToId === item.id ? (
                                  <div className="p-2 space-y-2 bg-slate-50 rounded-lg border border-slate-200">
                                    <input 
                                      type="text" 
                                      placeholder="Tên..." 
                                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-[8px] focus:outline-none" 
                                      value={newAttName} 
                                      onChange={(e) => setNewAttName(e.target.value)}
                                    />
                                    <input 
                                      type="text" 
                                      placeholder="Link..." 
                                      className="w-full p-1.5 bg-white border border-slate-200 rounded text-[8px] focus:outline-none" 
                                      value={newAttUrl} 
                                      onChange={(e) => setNewAttUrl(e.target.value)}
                                    />
                                    <div className="flex gap-1 justify-end">
                                      <button 
                                        onClick={() => {
                                          if (!newAttName || !newAttUrl) return;
                                          addAttachmentToTempAgenda(item.id, { name: newAttName, url: newAttUrl, type: 'link' });
                                          setNewAttName('');
                                          setNewAttUrl('');
                                          setAttachingToId(null);
                                        }}
                                        className={cn("px-2 py-0.5 rounded text-slate-800 text-[7px] font-black uppercase tracking-widest", isSharedItemTask ? "bg-brand-blue" : "bg-brand-pink")}
                                      >
                                        Ok
                                      </button>
                                      <button onClick={() => setAttachingToId(null)} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-400 text-[7px] font-bold">X</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => setAttachingToId(item.id)} className="text-[10px] text-slate-400 hover:text-brand-blue font-black uppercase tracking-widest flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md transition-colors">
                                    <Plus className="w-3 h-3" /> Tệp
                                  </button>
                                )}
                             </div>
                          </td>
                          <td className="px-3 py-4">
                            <button 
                              onClick={() => setTempAgenda(tempAgenda.filter(a => a.id !== item.id))}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50/50">
                        <td className="px-3 py-4"></td>
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              placeholder="0" 
                              min="0"
                              className="w-12 bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-slate-300"
                              value={agendaHours}
                              onChange={(e) => setAgendaHours(e.target.value)}
                            />
                            <span className="text-[10px] text-slate-400 font-bold">h</span>
                            <input 
                              type="number" 
                              placeholder="0" 
                              min="0" 
                              max="59"
                              className="w-12 bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-slate-300"
                              value={agendaMinutes}
                              onChange={(e) => setAgendaMinutes(e.target.value)}
                            />
                            <span className="text-[10px] text-slate-400 font-bold">p</span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <input 
                            type="text" 
                            placeholder="Hoạt động gì..."
                            value={agendaInput}
                            onChange={(e) => setAgendaInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addToTempAgenda()}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black focus:outline-none focus:border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-4">
                          <textarea 
                            placeholder="Mô tả chi tiết..."
                            value={agendaDetails}
                            onChange={(e) => setAgendaDetails(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-slate-300 min-h-[40px] resize-none"
                          />
                        </td>
                        <td className="px-3 py-4"></td>
                        <td className="px-3 py-4">
                           <button 
                             onClick={addToTempAgenda}
                             className={cn("px-4 py-2 text-slate-800 rounded-xl shadow-lg shadow-brand-blue/20 transition-all active:scale-95 flex items-center gap-2 text-xs font-black uppercase tracking-widest outline-none", isSharedItemTask ? "bg-brand-blue" : "bg-brand-pink")}
                           >
                             <Plus className="w-4 h-4" /> Thêm
                           </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8 px-8 pb-8">
              <button 
                onClick={async () => {
                   if (!newEventTitle.trim()) return;
                   const baseDate = sharedDetailDay || selectedDate;
                   const finalDate = new Date(format(baseDate, 'yyyy-MM-dd') + 'T' + plannerTime);
                   
                   try {
                     if (isSharedItemTask) {
                       await addTask(finalDate, 'work', true, newEventTitle.trim(), tempAgenda);
                     } else {
                       setSelectedDate(finalDate);
                       await addEvent(finalDate, finalDate, newEventTitle.trim(), 'pink', true, tempAgenda);
                     }
                     // Clear state
                     setNewEventTitle('');
                     setSharedNoteInput('');
                     setTempAgenda([]);
                     setAgendaInput('');
                     setAgendaHours('');
                     setAgendaMinutes('');
                     setAgendaDetails('');
                     setAgendaDuration('');
                     setActiveItemId(null);
                   } catch (err) {
                     console.error("Error adding shared item:", err);
                   }
                }}
                className={cn(
                  "w-full py-4 text-slate-800 rounded-2xl text-[13px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.01] active:scale-95 transition-all outline-none",
                  isSharedItemTask ? "bg-brand-blue shadow-brand-blue/30" : "bg-brand-pink shadow-brand-pink/30"
                )}
              >
                Xác nhận Thêm {isSharedItemTask ? 'công việc' : 'sự kiện'}
              </button>
            </div>
          </div>
        )}

        {sharedDetailDay ? (
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Sự kiện chung</h4>
                  <div className="space-y-3">
                    {allSharedEvents
                      .filter(e => isSameDay(e.start, sharedDetailDay))
                      .sort((a, b) => a.start.getTime() - b.start.getTime())
                      .map(e => (
                      <div key={e.id} className="p-5 bg-brand-pink/5 border border-brand-pink/10 rounded-2xl relative group">
                        {user?.uid === e.ownerId && (
                           <button onClick={() => deleteEvent(e.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-brand-pink hover:bg-brand-pink/10 p-1 rounded-lg transition-all">
                              <Trash2 className="w-3 h-3" />
                           </button>
                        )}
                        <p className="text-[10px] font-black text-brand-pink uppercase tracking-widest mb-1">{format(e.start, 'HH:mm')}</p>
                        <p className="font-bold text-slate-800 text-lg mb-1">{e.title}</p>
                        
                        {/* Agenda for Events */}
                        <div className="mb-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                             Lịch trình chi tiết
                          </span>
                        </div>
                        {renderAgendaTable(e.id, 'event', e.agenda || [], e.ownerId)}

                        {e.sharedNote && <p className="mt-4 p-3 bg-white/50 rounded-xl text-xs text-slate-500 italic border border-slate-100">{e.sharedNote}</p>}
                      </div>
                    ))}
                    {allSharedEvents.filter(e => isSameDay(e.start, sharedDetailDay)).length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-8 border border-dashed border-slate-200 rounded-2xl">Không có sự kiện nào...</p>
                    )}
                  </div>
               </div>
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Công việc chung</h4>
                  <div className="space-y-3">
                    {(() => {
                      const daySharedTasksList = allSharedTasks
                        .filter(t => 
                          isSameDay(t.date, sharedDetailDay) || 
                          (t.isFixed && (t.date.getDay() === sharedDetailDay.getDay()) && startOfDay(t.date) <= startOfDay(sharedDetailDay) && (!t.fixedUntil || startOfDay(sharedDetailDay) <= startOfDay(t.fixedUntil)))
                        )
                        .sort((a, b) => a.date.getTime() - b.date.getTime());
                      
                      return (
                        <>
                          {daySharedTasksList.map(t => (
                            <div key={t.id} className="p-5 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl relative group">
                              {user?.uid === t.ownerId && (
                                 <button onClick={() => deleteTask(t.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-brand-blue hover:bg-brand-blue/10 p-1 rounded-lg transition-all">
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              )}
                              <div className="flex items-start gap-3 mb-3">
                                <button 
                                  onClick={() => toggleTask(t)}
                                  className={cn(
                                    "mt-1 p-1 transition-all hover:scale-110 active:scale-95", 
                                    t.completed ? "text-amber-400" : "text-slate-200 hover:text-amber-200"
                                  )}
                                >
                                  <Star className={cn("w-5 h-5", t.completed ? "fill-amber-400" : "fill-none")} strokeWidth={2.5} />
                                </button>
                                <div>
                                  <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-1">{format(t.date, 'HH:mm')}</p>
                                  <p className={cn("font-bold text-slate-800 text-lg", t.completed && "line-through opacity-50")}>{t.title}</p>
                                </div>
                              </div>

                              {/* Agenda for Tasks */}
                              <div className="mb-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                   Lịch trình chi tiết
                                </span>
                              </div>
                              {renderAgendaTable(t.id, 'task', t.agenda || [], t.ownerId)}
                              
                              {t.sharedNote && <p className="mt-4 p-3 bg-white/50 rounded-xl text-xs text-slate-500 italic border border-slate-100">{t.sharedNote}</p>}
                            </div>
                          ))}
                          {daySharedTasksList.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center py-8 border border-dashed border-slate-200 rounded-2xl">Không có công việc nào...</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
               </div>
            </div>
          </div>
        ) : sharedCalendarView === 'month' ? (
          <div className="p-4">
            <div className="calendar-grid mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">{day}</div>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, monthStart);
                const daySharedEvents = allSharedEvents.filter(e => isSameDay(e.start, day));
                const daySharedTasks = allSharedTasks.filter(t => 
                  isSameDay(t.date, day) || 
                  (t.isFixed && t.date.getDay() === day.getDay() && startOfDay(t.date) <= startOfDay(day) && (!t.fixedUntil || startOfDay(day) <= startOfDay(t.fixedUntil)))
                );
                
                const totalTasks = daySharedTasks.length;
                const completedTasks = daySharedTasks.filter(t => t.completed).length;
                const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

                return (
                  <div key={day.toString()} className={cn(
                    "relative aspect-square p-2 border border-slate-50 cursor-pointer group transition-all",
                    !isCurrentMonth && "opacity-20 bg-slate-50/10",
                    isSameDay(day, selectedDate) && "bg-brand-pink/5"
                  )} onClick={() => { setSelectedDate(day); setSharedDetailDay(day); }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className={cn(
                        "w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black tracking-tight",
                        isDateToday(day) ? "bg-brand-blue text-slate-800" : isSameDay(day, selectedDate) ? "bg-brand-pink text-slate-800" : "text-slate-400"
                      )}>
                        {format(day, 'd')}
                      </div>
                      {completionPercentage !== null && (
                        <div className="text-[8px] font-black text-brand-blue bg-brand-blue/20 px-1.5 py-0.5 rounded-full border border-brand-blue/30">
                          {completionPercentage}%
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-24 scrollbar-hide">
                      {(() => {
                        const dayItems = [
                          ...daySharedEvents.map(e => ({ ...e, type: 'EV', time: e.start })),
                          ...daySharedTasks.map(t => ({ ...t, type: 'TK', time: t.date }))
                        ].sort((a, b) => a.time.getTime() - b.time.getTime());
                        
                        return (
                          <>
                            {dayItems.slice(0, 8).map((item, i) => (
                              <div key={i} className={cn(
                                "text-[9px] p-1 px-1.5 rounded-md font-black truncate shadow-sm text-slate-900 border",
                                item.type === 'EV' ? "bg-brand-pink border-brand-pink/30" : "bg-brand-blue border-brand-blue/30",
                                (item as any).completed && "line-through opacity-50 bg-slate-100 border-slate-200 text-slate-400"
                              )}>
                                {item.type}: {item.title}
                              </div>
                            ))}
                            {dayItems.length > 8 && <div className="text-[8px] text-center text-slate-400 font-bold">+{dayItems.length - 8}</div>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-7 gap-4 mb-4">
                {weekDays.map(day => (
                  <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-300">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-4">
                {(() => {
                  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
                  const weekDaysArr = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
                  return weekDaysArr.map(day => {
                    const dayEvents = allSharedEvents.filter(e => isSameDay(e.start, day));
                    const dayTasks = allSharedTasks.filter(t => 
                      isSameDay(t.date, day) || 
                      (t.isFixed && t.date.getDay() === day.getDay() && startOfDay(t.date) <= startOfDay(day) && (!t.fixedUntil || startOfDay(day) <= startOfDay(t.fixedUntil)))
                    );
                    const sortedItems = [
                      ...dayEvents.map(e => ({ ...e, type: 'EV' as const, time: e.start })),
                      ...dayTasks.map(t => ({ ...t, type: 'TK' as const, time: t.date }))
                    ].sort((a, b) => a.time.getTime() - b.time.getTime());

                    const totalTasks = dayTasks.length;
                    const completedTasks = dayTasks.filter(t => t.completed).length;
                    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

                    return (
                      <div 
                        key={day.toString()} 
                        onClick={() => setSharedDetailDay(day)}
                        className="min-h-[400px] border border-slate-100 rounded-2xl bg-slate-50/50 p-3 cursor-pointer hover:bg-white hover:shadow-xl transition-all group overflow-hidden"
                      >
                        <div className={cn(
                          "relative p-2 rounded-xl mb-4 transition-all group-hover:scale-105",
                          isDateToday(day) ? "bg-brand-blue text-slate-800 shadow-lg shadow-brand-blue/20" : "bg-white text-slate-800 shadow-sm border border-slate-100"
                        )}>
                          <p className="text-[10px] font-black uppercase tracking-widest">{format(day, 'EEE')}</p>
                          <p className="text-lg font-black">{format(day, 'd')}</p>
                          {completionPercentage !== null && (
                            <div className={cn(
                              "absolute border top-2 right-2 text-[8px] font-black px-1.5 py-0.5 rounded-full",
                              isDateToday(day) ? "bg-white/40 border-white/40 text-slate-800" : "bg-brand-blue/10 border-brand-blue/20 text-brand-blue"
                            )}>
                              {completionPercentage}%
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          {sortedItems.map(item => (
                            <div key={item.id} className={cn(
                              "p-3 border rounded-xl shadow-sm text-[10px]",
                              item.type === 'EV' ? "bg-brand-pink/5 border-brand-pink/10" : "bg-brand-blue/5 border-brand-blue/10"
                            )}>
                               <p className={cn(
                                 "font-black uppercase tracking-widest mb-1",
                                 item.type === 'EV' ? "text-brand-pink" : "text-brand-blue",
                                 (item as any).completed && "line-through"
                               )}>{format(item.time, 'HH:mm')}</p>
                               <p className={cn("font-bold text-slate-800 mb-2 truncate", (item as any).completed && "line-through opacity-50")}>{item.title}</p>
                               {item.sharedNote && <p className="p-2 bg-white/50 text-slate-500 rounded-lg italic border border-slate-50 line-clamp-2">{item.sharedNote}</p>}
                            </div>
                          ))}
                          {sortedItems.length === 0 && (
                             <div className="flex flex-col items-center justify-center pt-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="w-5 h-5 text-slate-200 mb-2" />
                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Thêm chi tiết</p>
                             </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {!isGuestView && (
        <div className="bg-gradient-to-br from-brand-pink/10 to-brand-blue/10 p-10 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-6">
            <Share2 className="text-brand-pink w-8 h-8" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-2">Chế độ Chia sẻ Hiện vật</h3>
          <p className="text-slate-500 max-w-md mb-8 font-medium">Link này sẽ cho phép đối phương xem được toàn bộ "Shared Schedule" của bạn. Các tab còn lại vẫn sẽ được bảo mật riêng tư.</p>
          <button 
            onClick={() => {
              const url = window.location.origin + window.location.pathname + '?view=guest';
              navigator.clipboard.writeText(url);
              alert('Đã copy link chia sẻ vào clipboard!');
            }}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all"
          >
             Sao chép Link Chia sẻ
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCFB] font-sans">
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/30"><CalendarIcon className="text-slate-800 w-6 h-6" /></div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">MySchedule</h1>
        </div>
        {user && (
          <nav className="hidden md:flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Tổng quan', private: true },
              { id: 'checklist', icon: ClipboardList, label: 'Việc cần làm', private: true },
              { id: 'planner', icon: Target, label: 'Lên kế hoạch', private: true },
              { id: 'shared', icon: Share2, label: 'Shared Schedule', private: false }
            ].filter(tab => !isGuestView || !tab.private).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}><tab.icon className="w-4 h-4" /><span>{tab.label}</span></button>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-4">
          {!user && isGuestView && (
             <button onClick={() => setIsGuestView(false)} className="text-xs font-black text-brand-blue uppercase tracking-widest hover:underline">Đăng nhập</button>
          )}
          {user && (
            <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Đăng xuất">
              <LogOut className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-brand-pink/20 border-2 border-brand-pink flex items-center justify-center cursor-pointer overflow-hidden">
            {user?.photoURL ? <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : <Users className="text-brand-pink w-5 h-5" />}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {activeTab !== 'shared' && (
          <aside className="lg:col-span-3 flex flex-col gap-8">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-brand-pink" /><span>Ngày hôm nay</span></h2>
            <div className="space-y-4">
              {(() => {
                const today = new Date();
                const todayTasks = tasks.filter(t => 
                  !isGuestView && (
                    isSameDay(t.date, today) || 
                    (t.isFixed && t.date.getDay() === today.getDay() && startOfDay(t.date) <= startOfDay(today) && (!t.fixedUntil || startOfDay(today) <= startOfDay(t.fixedUntil)))
                  )
                );
                const todayEvents = events.filter(e => isSameDay(e.start, today) && (!isGuestView || e.isShared));
                const completedToday = todayTasks.filter(t => t.completed).length;
                const totalToday = todayTasks.length;
                const pendingToday = todayTasks.filter(t => !t.completed).length;
                const progress = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">Sự kiện</span>
                      <span className="text-sm font-black text-slate-800">{todayEvents.length}</span>
                    </div>
                    {!isGuestView && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500">Cần làm</span>
                          <span className="text-sm font-black text-slate-800">{pendingToday}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500">Đã xong</span>
                          <span className="text-sm font-black text-brand-pink">{completedToday}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="bg-brand-pink h-full" 
                          />
                        </div>
                      </>
                    )}
                    {isGuestView && (
                      <p className="text-[10px] text-slate-400 italic">Dữ liệu việc cần làm đang được ẩn.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Plus className="w-5 h-5 text-brand-pink" /><span>Sắp diễn ra</span></h2>
            <div className="space-y-3">
              {(() => {
                const today = startOfToday();
                // For regular items, just future ones. 
                // For fixed items, find the next occurrence relative to today.
                const nextOccurrences: { id: string, title: string, type: 'task' | 'event', date: Date, color?: string }[] = [];

                events.forEach(e => {
                  if (isAfter(e.start, today) || isSameDay(e.start, today)) {
                    nextOccurrences.push({ ...e, type: 'event', date: e.start });
                  }
                });

                tasks.forEach(t => {
                   if (!t.completed) {
                     if (isAfter(t.date, today) || isSameDay(t.date, today)) {
                       nextOccurrences.push({ ...t, type: 'task', date: t.date });
                     } else if (t.isFixed) {
                       // If in past, find next occurrence
                       let next = t.date;
                       while (next < today) {
                         next = addDays(next, 7);
                       }
                       if (!t.fixedUntil || startOfDay(next) <= startOfDay(t.fixedUntil)) {
                         nextOccurrences.push({ ...t, type: 'task', date: next });
                       }
                     }
                   }
                });

                const combined = nextOccurrences
                  .sort((a,b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 6);

                return combined.map(item => (
                  <motion.div key={`${item.type}-${item.id}`} whileHover={{ x: 4 }} className={cn(
                    "p-3 rounded-2xl border-l-4 transition-all group relative", 
                    item.type === 'event' 
                      ? (item.color === 'blue' ? "bg-brand-blue/5 border-brand-blue" : "bg-brand-pink/5 border-brand-pink")
                      : "bg-amber-50 border-amber-400"
                  )}>
                    {item.type === 'event' && !isGuestView ? (
                       <button 
                        onClick={() => deleteEvent(item.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    ) : item.type === 'task' ? (
                      <div className="absolute top-2 right-2 p-1 bg-amber-100 text-amber-600 rounded-md">
                        <Target className="w-2.5 h-2.5" />
                      </div>
                    ) : null}
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                      {format(item.date, 'MM/dd, HH:mm', { locale: vi })}
                    </p>
                    <p className="font-bold text-slate-700 truncate">{item.title}</p>
                  </motion.div>
                ));
              })()}
              {events.filter(e => !isGuestView || e.isShared).length === 0 && tasks.filter(t => !t.completed).length === 0 && <p className="text-[10px] text-slate-300 italic font-bold uppercase tracking-widest text-center py-4">Trống trải...</p>}
            </div>
          </div>
          <div className="bg-gradient-to-br from-brand-blue/20 to-brand-pink/20 p-6 rounded-3xl border border-white/50 shadow-inner">
            <div className="flex items-center gap-2 mb-2"><Cloud className="w-4 h-4 text-brand-blue" /><span className="font-bold text-slate-800 text-sm">Đồng bộ</span></div>
            <p className="text-[9px] text-slate-600 mb-4 leading-relaxed font-black uppercase tracking-widest">REALTIME CLOUD SYNC ACTIVE</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ĐÃ KẾT NỐI</span>
            </div>
          </div>
        </aside>
      )}

        <AnimatePresence mode="wait">
          <motion.div 
            key={activeTab} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }} 
            transition={{ duration: 0.2 }} 
            className={cn(activeTab === 'shared' ? "lg:col-span-12" : "lg:col-span-9")}
          >
            {(activeTab === 'dashboard' && !isGuestView) && renderDashboard()}
            {(activeTab === 'checklist' && !isGuestView) && renderChecklist()}
            {(activeTab === 'planner' && !isGuestView) && renderPlanner()}
            {activeTab === 'shared' && renderShared()}
            {(isGuestView && activeTab !== 'shared') && (
              <div className="flex flex-col items-center justify-center h-[500px] text-center">
                 <CalendarIcon className="w-20 h-20 text-slate-200 mb-6" />
                 <p className="text-slate-400 font-bold italic">Khu vực này hiện đang đươc bảo mật.</p>
                 <button onClick={() => setActiveTab('shared')} className="mt-4 text-brand-blue font-black uppercase text-xs tracking-widest hover:underline">Quay lại Shared Schedule</button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {user && !isGuestView && (
        <button 
          onClick={() => setIsEventModalOpen(true)}
          className="fixed bottom-8 right-8 w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 shadow-brand-blue/20"
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      {/* Event Add Modal */}
      <AnimatePresence>
        {isEventModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl"
            >
              <h2 className="text-2xl font-black text-slate-800 mb-6 tracking-tight">Thêm sự kiện mới</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Tên sự kiện</label>
                  <input 
                    type="text" 
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    placeholder="Ví dụ: Họp nhóm..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:border-brand-blue/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Ngày đã chọn</label>
                  <div className="px-5 py-3 bg-slate-50 rounded-2xl text-sm font-bold text-slate-600">
                    {format(selectedDate, 'dd/MM/yyyy', { locale: vi })}
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setIsEventModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  Hủy
                </button>
                <button 
                  onClick={addEvent}
                  className="flex-1 py-4 bg-brand-pink text-slate-800 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-brand-pink/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Tạo ngay
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Tab Navigation */}
      {user && (
        <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-white/95 backdrop-blur shadow-2xl border border-slate-100 rounded-3xl z-40 flex items-center justify-around px-4">
          {[
            { id: 'dashboard', icon: LayoutDashboard, private: true },
            { id: 'checklist', icon: ClipboardList, private: true },
            { id: 'planner', icon: Target, private: true },
            { id: 'shared', icon: Share2, private: false }
          ].filter(tab => !isGuestView || !tab.private).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "p-3 rounded-2xl transition-all",
                activeTab === tab.id ? "bg-brand-blue/20 text-brand-blue" : "text-slate-400"
              )}
            >
              <tab.icon className="w-6 h-6" />
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

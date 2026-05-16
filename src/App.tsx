import { useState, useMemo, useEffect, Fragment } from 'react';
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
  isBefore,
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

interface Event {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: 'blue' | 'pink' | 'purple';
  isShared: boolean;
  sharedNote?: string;
  sharingRoom?: string;
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
  sharingRoom?: string;
  ownerId: string;
  completedDates?: string[];
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
  const [sharingRoom, setSharingRoom] = useState<string>('');
  const [roomInput, setRoomInput] = useState('');
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
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  };

  const combineDateAndTime = (dateStr: string, timeStr: string) => {
    const d = parseLocalDate(dateStr);
    if (!d) return null;
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    if (!isNaN(h)) d.setHours(h);
    if (!isNaN(m)) d.setMinutes(m);
    return d;
  };

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');

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
          fixedUntil: d.data().fixedUntil ? (d.data().fixedUntil as Timestamp).toDate() : undefined,
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

  // Sync Shared Events based on Room
  useEffect(() => {
    if (!sharingRoom) {
      setAllSharedEvents([]);
      return;
    }
    const qShared = query(collection(db, 'events'), where('sharingRoom', '==', sharingRoom));
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
  }, [sharingRoom]);

  // Sync Shared Tasks based on Room
  useEffect(() => {
    if (!sharingRoom) {
      setAllSharedTasks([]);
      return;
    }
    const qSharedTasks = query(collection(db, 'tasks'), where('sharingRoom', '==', sharingRoom));
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
  }, [sharingRoom]);

  // Firestore Actions
  const addTask = async (customDate?: Date, customTag?: TaskTag, isSharedMode?: boolean, customTitle?: string) => {
    const title = customTitle || newTaskTitle;
    if (!user || !title.trim()) return;
    try {
      let finalDate = customDate || selectedDate;
      
      // If we are in planner or provided a date, try to merge with plannerTime if it exists
      if (activeTab === 'planner' || customDate) {
        if (!customDate) { // only if not explicitly provided
          const combined = combineDateAndTime(plannerDate, plannerTime);
          if (combined) finalDate = combined;
        }
      }

      if (!finalDate || isNaN(finalDate.getTime())) {
        console.error("Invalid finalDate", finalDate);
        return;
      }

      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), {
          title: title,
          date: Timestamp.fromDate(finalDate),
          tag: selectedTag,
          customTagLabel: selectedTag === 'other' ? customTagLabel : '',
          isFixed: isFixed,
          fixedUntil: isFixed && fixedUntilDate && parseLocalDate(fixedUntilDate) ? Timestamp.fromDate(parseLocalDate(fixedUntilDate)!) : null,
          isShared: isSharedMode || editingTask.isShared || false,
          sharedNote: isSharedMode ? sharedNoteInput : (editingTask.sharedNote || ''),
        });
        setEditingTask(null);
        setNewTaskTitle('');
        setIsFixed(false);
        setFixedUntilDate('');
        setCustomTagLabel('');
        setSharedNoteInput('');
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
        fixedUntil: isFixed && fixedUntilDate && parseLocalDate(fixedUntilDate) ? Timestamp.fromDate(parseLocalDate(fixedUntilDate)!) : null,
        isShared: isSharedMode || false,
        sharingRoom: isSharedMode ? sharingRoom : null,
        sharedNote: sharedNoteInput,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewTaskTitle('');
      setCustomTagLabel('');
      setIsFixed(false);
      setFixedUntilDate('');
      setSharedNoteInput('');
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
    setSharedNoteInput(task.sharedNote || '');
    setPlannerInputType('task');
    setActiveTab('planner');
  };

  const startEditingEvent = (event: Event) => {
    setEditingEvent(event);
    setNewTaskTitle(event.title);
    setPlannerDate(format(event.start, 'yyyy-MM-dd'));
    setPlannerTime(format(event.start, 'HH:mm'));
    setSharedNoteInput(event.sharedNote || '');
    setPlannerInputType('event');
    setActiveTab('planner');
  };

  const isTaskCompleted = (task: Task, date: Date) => {
    if (task.isFixed) {
      const dateStr = format(date, 'yyyy-MM-dd');
      return task.completedDates?.includes(dateStr) || false;
    }
    return task.completed;
  };

  const toggleTask = async (task: Task, specificDate?: Date) => {
    if (!user) return;
    try {
      if (task.isFixed && specificDate) {
        const dateStr = format(specificDate, 'yyyy-MM-dd');
        const currentDates = task.completedDates || [];
        const newDates = currentDates.includes(dateStr)
          ? currentDates.filter(d => d !== dateStr)
          : [...currentDates, dateStr];
        
        await updateDoc(doc(db, 'tasks', task.id), {
          completedDates: newDates
        });
      } else {
        await updateDoc(doc(db, 'tasks', task.id), {
          completed: !task.completed
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
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

  const addEvent = async (customStart?: Date, customEnd?: Date, customTitle?: string, customColor?: 'blue' | 'pink' | 'purple', isSharedView?: boolean) => {
    const title = customTitle || newEventTitle;
    if (!user || !title.trim()) return;
    try {
      await addDoc(collection(db, 'events'), {
        title: title,
        start: Timestamp.fromDate(customStart || selectedDate),
        end: Timestamp.fromDate(customEnd || customStart || selectedDate),
        color: customColor || 'pink',
        isShared: isSharedView || false,
        sharingRoom: isSharedView ? sharingRoom : null,
        sharedNote: sharedNoteInput,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewEventTitle('');
      setSharedNoteInput('');
      setIsEventModalOpen(false);
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

  // Check URL for guest view or shared room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const room = params.get('room');
    
    if (view === 'guest' || view === 'shared') {
      setIsGuestView(true);
      setActiveTab('shared');
      if (room) setSharingRoom(room);
    }
  }, []);

  // Calendar Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

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
  const dayEvents = events.filter(e => isSameDay(e.start, selectedDate)).sort((a, b) => a.start.getTime() - b.start.getTime());
  
  const completedCount = dayTasks.filter(t => isTaskCompleted(t, selectedDate)).length;
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
                ...dayEvents.map(e => ({ ...e, type: 'event' as const, time: e.start })),
                ...dayTasksForCalendar.map(t => ({ id: t.id, title: t.title, type: 'task' as const, completed: isTaskCompleted(t, day), tag: t.tag, time: t.date }))
              ].sort((a, b) => a.time.getTime() - b.time.getTime());

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
                    <div className="mt-1 space-y-1 overflow-y-auto max-h-[70%] scrollbar-hide">
                      {dayItems.slice(0, 10).map((item, i) => (
                        <div key={`${item.type}-${item.id}`} className={cn(
                          "text-[8px] px-1 py-0.5 rounded-md font-bold truncate tracking-tighter shadow-sm border leading-none",
                          item.type === 'event' 
                            ? "bg-brand-blue/20 text-brand-blue border-brand-blue/20" 
                            : item.completed 
                              ? "bg-slate-100 text-slate-400 border-slate-200"
                              : "bg-brand-pink/20 text-brand-pink border-brand-pink/20"
                        )}>
                          {item.type === 'task' && '• '}{item.title}
                        </div>
                      ))}
                      {dayItems.length > 10 && <div className="text-[7px] font-black text-slate-400 text-center">+{dayItems.length - 10}</div>}
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

  const renderChecklist = () => {
    const allDayItems = [
      ...dayEvents.map(e => ({ ...e, type: 'event' as const, time: e.start })),
      ...dayTasks.map(t => ({ ...t, type: 'task' as const, time: t.date }))
    ].sort((a, b) => a.time.getTime() - b.time.getTime());

    return (
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
            {allDayItems.map(item => {
              const isTask = item.type === 'task';
              const isCompleted = isTask ? isTaskCompleted(item as Task, selectedDate) : false;
              let timeStr = '--:--';
              try {
                 timeStr = format(item.time, 'HH:mm');
              } catch (e) {}
              
              return (
                <Fragment key={`${item.type}-${item.id}`}>
                  <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border transition-all group",
                    isCompleted ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-100 shadow-sm"
                  )}>
                    {isTask ? (
                      <button 
                        onClick={() => toggleTask(item as Task, selectedDate)}
                        className={cn("p-1 transition-all hover:scale-110 active:scale-95", isCompleted ? "text-amber-400" : "text-slate-200 hover:text-amber-200")}
                      >
                        <Star className={cn("w-6 h-6", isCompleted ? "fill-amber-400" : "fill-none")} strokeWidth={2.5} />
                      </button>
                    ) : (
                      <div className="p-1 text-brand-pink">
                        <Clock className="w-6 h-6" strokeWidth={2.5} />
                      </div>
                    )}
                    
                    <div className="flex-1">
                       <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                         <span className="text-[10px] text-brand-blue font-black opacity-50">{timeStr}</span>
                         {item.title}
                       </div>
                     {isTask && (item as Task).tag && (
                       <div className={cn(
                         "inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md mt-1",
                         TASK_TAGS.find(t => t.id === (item as Task).tag)?.color || "bg-slate-100 text-slate-400"
                       )}>
                         {(item as Task).tag === 'other' ? ((item as Task).customTagLabel || 'Khác') : TASK_TAGS.find(t => t.id === (item as Task).tag)?.label}
                         {(item as Task).isFixed && <span className="ml-2 opacity-50 tracking-normal text-[7px] font-medium">(Cố định)</span>}
                       </div>
                     )}
                     {!isTask && (
                       <div className="inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md mt-1 bg-brand-pink/10 text-brand-pink border border-brand-pink/20">
                         Sự kiện
                       </div>
                     )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => isTask ? startEditing(item as Task) : startEditingEvent(item as Event)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-brand-blue transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => isTask ? deleteTask(item.id) : deleteEvent(item.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              </Fragment>
              );
            })}
          </AnimatePresence>
          {allDayItems.length === 0 && (
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
  };

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
                   <p className="text-[9px] text-slate-400 font-medium">Lặp lại mỗi thứ {(() => {
                     const d = parseLocalDate(plannerDate);
                     if (!d) return '...';
                     const dayNames = ['Chủ nhật', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'];
                     return dayNames[d.getDay()];
                   })()} hàng tuần.</p>
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

              <div className="pt-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block font-black">Mô tả tổng quát</label>
                  <textarea 
                    value={sharedNoteInput}
                    onChange={(e) => setSharedNoteInput(e.target.value)}
                    placeholder="Ghi chú nhanh cho kế hoạch này..."
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-medium focus:outline-none focus:border-brand-blue/50 shadow-sm h-[80px] resize-none"
                  />
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
                     const d = combineDateAndTime(plannerDate, plannerTime) || new Date();
                     if (plannerInputType === 'task') {
                       addTask(d, selectedTag, isSharedItemTask);
                     } else {
                       addEvent(d, d, newTaskTitle, 'blue', isSharedItemTask);
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
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
                  Sự kiện trong ngày ({(() => {
                    const d = parseLocalDate(plannerDate);
                    if (d && !isNaN(d.getTime())) return format(d, 'dd/MM');
                    return '--/--';
                  })()})
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const d = parseLocalDate(plannerDate);
                    if (!d || isNaN(d.getTime())) return null;
                    return events.filter(e => isSameDay(e.start, d)).map(event => (
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
                    ));
                  })()}
                  {(() => {
                    const d = parseLocalDate(plannerDate);
                    if (d && !isNaN(d.getTime()) && events.filter(e => isSameDay(e.start, d)).length === 0) {
                      return <p className="text-[10px] text-slate-300 italic font-bold uppercase tracking-widest text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">Không có sự kiện nào...</p>;
                    }
                    return null;
                  })()}
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
                    !isTaskCompleted(t, dayDate) && (
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
                    <p className="text-[10px] text-slate-300 italic font-bold uppercase tracking-widest text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">Không có công việc nào...</p>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  const renderShared = () => {
    if (!sharingRoom) {
      return (
        <div className="lg:col-span-9 h-[600px] flex items-center justify-center p-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-10 text-center"
          >
            <div className="w-20 h-20 bg-brand-blue/10 text-brand-blue rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-2">Phòng Chia Sẻ</h2>
            <p className="text-slate-500 text-sm font-medium mb-8">
              Tham gia hoặc tạo một không gian làm việc chung để lên kế hoạch cùng đồng đội, gia đình hoặc bạn bè.
            </p>
            
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="Nhập mã phòng (ví dụ: TEAM_2024)"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-brand-blue transition-all"
                />
                <button 
                  onClick={() => setSharingRoom(roomInput.trim().toUpperCase())}
                  disabled={!roomInput.trim()}
                  className="mt-4 w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  Vào Phòng
                </button>
              </div>
              
              <div className="pt-4 flex items-center gap-4">
                <div className="h-px bg-slate-100 flex-1"></div>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Hoặc</span>
                <div className="h-px bg-slate-100 flex-1"></div>
              </div>
              
              <button 
                onClick={() => {
                  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                  setSharingRoom(code);
                }}
                className="w-full py-4 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
              >
                Tạo Phòng Mới
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="lg:col-span-9 space-y-8">
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-8 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {sharedDetailDay ? (
                <button 
                  onClick={() => setSharedDetailDay(null)}
                  className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
              ) : (
                <button 
                  onClick={() => setSharingRoom('')}
                  className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                >
                  <LogOut className="w-5 h-5 text-white" />
                </button>
              )}
              <div>
                <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
                  {sharedDetailDay ? `Kế hoạch ${format(sharedDetailDay, 'dd/MM')}` : (
                    <>
                      <span>Phòng: {sharingRoom}</span>
                      <button 
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}?view=shared&room=${sharingRoom}`;
                          navigator.clipboard.writeText(url);
                          alert('Đã sao chép link mời vào phòng!');
                        }}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </h2>
                <p className="text-slate-400 text-sm font-medium mt-1">
                  {sharedDetailDay ? 'Chi tiết các đầu việc chung cho ngày này' : 'Không gian làm việc chung. Chỉ những người có mã phòng mới có thể truy cập.'}
                </p>
              </div>
            </div>
            {!sharedDetailDay && (
              <div className="hidden md:flex items-center gap-2 bg-white/10 p-1 rounded-2xl border border-white/10">
                <button 
                  onClick={() => setSharedCalendarView('month')}
                  className={cn(
                    "px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                    sharedCalendarView === 'month' ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
                  )}
                >
                  Tháng
                </button>
                <button 
                  onClick={() => setSharedCalendarView('week')}
                  className={cn(
                    "px-4 py-2 text-xs font-black uppercase tracking-widest transition-all rounded-xl",
                    sharedCalendarView === 'week' ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
                  )}
                >
                  Tuần
                </button>
              </div>
            )}
          </div>
          
          {user && !isGuestView && (
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                  {sharedDetailDay ? 'Thêm kế hoạch cho ngày này' : 'Dự định sắp tới'}
                </h3>
                <div className="flex items-center gap-2 p-1 bg-slate-200 rounded-2xl">
                  <button onClick={() => setIsSharedItemTask(false)} className={cn("px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", !isSharedItemTask ? "bg-white text-brand-pink shadow-sm" : "text-slate-400")}>Sự kiện</button>
                  <button onClick={() => setIsSharedItemTask(true)} className={cn("px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", isSharedItemTask ? "bg-white text-brand-blue shadow-sm" : "text-slate-400")}>Việc làm</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <input 
                    type="text" 
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    placeholder={isSharedItemTask ? "Tên công việc cần làm chung..." : "Tên sự kiện sắp tới..."}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:ring-2 ring-brand-blue/5"
                  />
                  <div className="flex gap-4">
                    {!sharedDetailDay && (
                      <div className="flex-1">
                        <input 
                          type="date" 
                          value={format(selectedDate, 'yyyy-MM-dd')}
                          onChange={(e) => {
                            const d = new Date(e.target.value);
                            if (!isNaN(d.getTime())) setSelectedDate(d);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <input 
                        type="time" 
                        value={plannerTime}
                        onChange={(e) => setPlannerTime(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <textarea 
                    value={sharedNoteInput}
                    onChange={(e) => setSharedNoteInput(e.target.value)}
                    placeholder="Ghi chú nhanh cho đồng đội..."
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-medium focus:outline-none h-[100px] resize-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  onClick={async () => {
                    if (!newEventTitle.trim()) return;
                    const baseDate = sharedDetailDay || selectedDate;
                    const finalDate = new Date(format(baseDate, 'yyyy-MM-dd') + 'T' + plannerTime);
                    
                    try {
                      if (isSharedItemTask) {
                        await addTask(finalDate, 'work', true, newEventTitle.trim());
                      } else {
                        await addEvent(finalDate, finalDate, newEventTitle.trim(), 'pink', true);
                      }
                      setNewEventTitle('');
                      setSharedNoteInput('');
                      alert('Đã thêm kế hoạch chung!');
                    } catch (err) {
                      console.error("Error adding shared item:", err);
                    }
                  }}
                  className={cn(
                    "px-10 py-3 text-slate-800 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all",
                    isSharedItemTask ? "bg-brand-blue shadow-brand-blue/20" : "bg-brand-pink shadow-brand-pink/20"
                  )}
                >
                  Thêm vào Phòng
                </button>
              </div>
            </div>
          )}

          {sharedDetailDay ? (
            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Events Section */}
                 <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-1.5 h-6 bg-brand-pink rounded-full"></div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 text-pink-600">Sự kiện chung</h4>
                    </div>
                    <div className="space-y-4">
                       {allSharedEvents
                        .filter(e => isSameDay(e.start, sharedDetailDay))
                        .sort((a,b) => a.start.getTime() - b.start.getTime())
                        .map(e => (
                          <div key={e.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <span className="bg-brand-pink/10 text-brand-pink text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                                  {format(e.start, 'HH:mm')}
                                </span>
                                <h5 className="font-bold text-slate-800 text-lg">{e.title}</h5>
                              </div>
                              <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {e.sharedNote && (
                              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border-l-4 border-brand-pink/30 flex gap-3">
                                <MessageSquare className="w-4 h-4 text-brand-pink shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-500 italic leading-relaxed">{e.sharedNote}</p>
                              </div>
                            )}
                          </div>
                        ))
                       }
                       {allSharedEvents.filter(e => isSameDay(e.start, sharedDetailDay)).length === 0 && (
                          <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                            <p className="text-slate-300 font-bold text-sm">Không có sự kiện nào...</p>
                          </div>
                       )}
                    </div>
                 </div>

                 {/* Tasks Section */}
                 <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-1.5 h-6 bg-brand-blue rounded-full"></div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 text-blue-600">Công việc chung</h4>
                    </div>
                    <div className="space-y-4">
                       {(() => {
                         const dayTasks = allSharedTasks.filter(t => 
                           isSameDay(t.date, sharedDetailDay) || 
                           (t.isFixed && (t.date.getDay() === sharedDetailDay.getDay()) && startOfDay(t.date) <= startOfDay(sharedDetailDay) && (!t.fixedUntil || startOfDay(sharedDetailDay) <= startOfDay(t.fixedUntil)))
                         ).sort((a,b) => a.date.getTime() - b.date.getTime());

                         return dayTasks.map(t => (
                           <div key={t.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all group">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-4">
                                  <button onClick={() => toggleTask(t, sharedDetailDay)} className={cn("p-1 transition-all hover:scale-110", isTaskCompleted(t, sharedDetailDay) ? "text-amber-400" : "text-slate-200")}>
                                    <Star className={cn("w-6 h-6", isTaskCompleted(t, sharedDetailDay) ? "fill-amber-400" : "fill-none")} strokeWidth={2.5}/>
                                  </button>
                                  <div>
                                    <span className="bg-brand-blue/10 text-brand-blue text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mb-1 inline-block">
                                      {format(t.date, 'HH:mm')}
                                    </span>
                                    <h5 className={cn("font-bold text-slate-800 text-lg", isTaskCompleted(t, sharedDetailDay) && "line-through opacity-40")}>{t.title}</h5>
                                  </div>
                                </div>
                                <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {t.sharedNote && (
                                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border-l-4 border-brand-blue/30 flex gap-3">
                                  <MessageSquare className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                                  <p className="text-xs text-slate-500 italic leading-relaxed">{t.sharedNote}</p>
                                </div>
                              )}
                           </div>
                         ));
                       })()}
                       {allSharedTasks.filter(t => isSameDay(t.date, sharedDetailDay)).length === 0 && (
                          <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                            <p className="text-slate-300 font-bold text-sm">Không có công việc nào...</p>
                          </div>
                       )}
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
                  const completedTasks = daySharedTasks.filter(t => isTaskCompleted(t, day)).length;
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
                          isDateToday(day) ? "bg-brand-blue text-slate-800 shadow-sm" : "text-slate-400"
                        )}>
                          {format(day, 'd')}
                        </div>
                        {completionPercentage !== null && (
                          <div className="text-[8px] font-black text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded-full border border-brand-blue/30">
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
                                  "text-[8px] p-1 px-1.5 rounded-md font-black truncate shadow-sm text-slate-800 border",
                                  item.type === 'EV' ? "bg-brand-pink border-brand-pink/20" : "bg-brand-blue border-brand-blue/20",
                                  (isTaskCompleted(item as Task, day)) && "line-through opacity-50 bg-slate-100 border-slate-200 text-slate-400"
                                )}>
                                  {item.title}
                                </div>
                              ))}
                              {dayItems.length > 8 && <div className="text-[7px] text-center text-slate-400 font-bold">+{dayItems.length - 8}</div>}
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
            <div className="p-8">
              {/* Simplified Week View */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {(() => {
                  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
                  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(day => {
                    const dayEvents = allSharedEvents.filter(e => isSameDay(e.start, day));
                    const dayTasks = allSharedTasks.filter(t => 
                      isSameDay(t.date, day) || 
                      (t.isFixed && t.date.getDay() === day.getDay() && startOfDay(t.date) <= startOfDay(day) && (!t.fixedUntil || startOfDay(day) <= startOfDay(t.fixedUntil)))
                    );
                    return (
                      <div key={day.toString()} onClick={() => { setSelectedDate(day); setSharedDetailDay(day); }} className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer h-full min-h-[150px]",
                        isDateToday(day) ? "bg-brand-blue/5 border-brand-blue/20 ring-1 ring-brand-blue/20" : "bg-white border-slate-100 hover:border-slate-200"
                      )}>
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">{format(day, 'EEEE', { locale: vi })}</div>
                        <div className="text-xl font-black text-slate-800 mb-4">{format(day, 'd')}</div>
                        <div className="space-y-1">
                          {dayEvents.map(e => <div key={e.id} className="text-[8px] font-bold text-brand-pink truncate">• {e.title}</div>)}
                          {dayTasks.map(t => <div key={t.id} className={cn("text-[8px] font-bold text-brand-blue truncate", isTaskCompleted(t, day) && "line-through opacity-40")}>• {t.title}</div>)}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

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
                const completedToday = todayTasks.filter(t => isTaskCompleted(t, today)).length;
                const totalToday = todayTasks.length;
                const pendingToday = todayTasks.filter(t => !isTaskCompleted(t, today)).length;
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
                const limitDate = addDays(today, 2); // Today + 1 day = 2 days total
                // For regular items, just future ones. 
                // For fixed items, find the next occurrence relative to today.
                const nextOccurrences: { id: string, title: string, type: 'task' | 'event', date: Date, color?: string }[] = [];

                events.forEach(e => {
                  if ((isAfter(e.start, today) || isSameDay(e.start, today)) && isBefore(e.start, limitDate)) {
                    nextOccurrences.push({ ...e, type: 'event', date: e.start });
                  }
                });

                tasks.forEach(t => {
                   if (isAfter(t.date, today) || isSameDay(t.date, today)) {
                     if (!isTaskCompleted(t, t.date) && isBefore(t.date, limitDate)) {
                       nextOccurrences.push({ ...t, type: 'task', date: t.date });
                     }
                   } else if (t.isFixed) {
                     // If in past, find next occurrence
                     let next = t.date;
                     while (next < today) {
                       next = addDays(next, 7);
                     }
                     if (isBefore(next, limitDate) && (!t.fixedUntil || startOfDay(next) <= startOfDay(t.fixedUntil))) {
                       if (!isTaskCompleted(t, next)) {
                         nextOccurrences.push({ ...t, type: 'task', date: next });
                       }
                     }
                   }
                });

                const combined = nextOccurrences
                  .sort((a,b) => a.date.getTime() - b.date.getTime())
                  .slice(0, 6);

                if (combined.length === 0) {
                  return <p className="text-[10px] text-slate-300 italic font-bold uppercase tracking-widest text-center py-4">Trống trải...</p>;
                }

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

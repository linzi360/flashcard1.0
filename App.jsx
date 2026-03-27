import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useHotkeys } from 'react-hotkeys-hook';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { 
  Moon, Sun, Upload, Download, Settings, Volume2, CheckCircle2, XCircle, 
  ChevronLeft, BookOpen, Brain, TrendingUp, Plus, X, Edit, BarChart2, FileText
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useDropzone } from 'react-dropzone';

const API = 'http://localhost:8080/api';

// --- 富文本编辑器配置 ---
const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'color': [] }, { 'background': [] }],
    ['link', 'image', 'code-block'],
    ['clean']
  ],
};

// --- Markdown+LaTeX渲染组件 ---
const MarkdownRenderer = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    components={{
      code({ node, inline, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
          <pre className="p-2 bg-gray-100 dark:bg-gray-700 rounded overflow-x-auto">
            <code className={className} {...props}>{children}</code>
          </pre>
        ) : (
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded" {...props}>{children}</code>
        );
      },
      math({ value }) {
        return <BlockMath math={value} />;
      },
      inlineMath({ value }) {
        return <InlineMath math={value} />;
      },
    }}
  >
    {content}
  </ReactMarkdown>
);

// --- 附件预览组件 ---
const AttachmentPreview = ({ attachments }) => {
  let atts = [];
  try {
    atts = JSON.parse(attachments || '[]');
  } catch (e) {
    atts = [];
  }
  
  if (atts.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {atts.map((att, idx) => (
        <div key={idx} className="relative">
          {att.type.startsWith('image/') ? (
            <img src={att.url} alt="Attachment" className="w-24 h-24 object-cover rounded-lg border" />
          ) : att.type.startsWith('audio/') ? (
            <div className="w-48 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <audio controls className="w-full" src={att.url} />
            </div>
          ) : (
            <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <FileText className="w-4 h-4" />
              <span className="text-sm">附件</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
};

// --- 卡片编辑组件 ---
const CardEditor = ({ card, onChange, onSave, onCancel, onDelete }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'audio/*': ['.mp3', '.wav', '.ogg'],
      'application/pdf': ['.pdf']
    },
    onDrop: async (acceptedFiles) => {
      const newAttachments = [...JSON.parse(card.attachments || '[]')];
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const response = await axios.post(`${API}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          newAttachments.push({ url: response.data.url, type: response.data.type });
        } catch (error) {
          console.error('Upload failed:', error);
        }
      }
      onChange({ ...card, attachments: JSON.stringify(newAttachments) });
    }
  });

  const removeAttachment = (index) => {
    const atts = JSON.parse(card.attachments || '[]');
    atts.splice(index, 1);
    onChange({ ...card, attachments: JSON.stringify(atts) });
  };

  const inputClass = 'w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const cardClass = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{card.id ? '编辑卡片' : '新建卡片'}</h2>
        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onCancel}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">正面（问题/提示）</label>
        <div className={cardClass}>
          <ReactQuill 
            theme="snow" 
            value={card.front || ''} 
            onChange={(val) => onChange({ ...card, front: val })} 
            modules={modules}
            placeholder="支持富文本、图片、代码块..."
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">背面（答案/释义）</label>
        <div className={cardClass}>
          <ReactQuill 
            theme="snow" 
            value={card.back || ''} 
            onChange={(val) => onChange({ ...card, back: val })} 
            modules={modules}
            placeholder="支持富文本、图片、代码块..."
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">标签（逗号分隔）</label>
        <input
          type="text"
          value={card.tags || ''}
          onChange={(e) => onChange({ ...card, tags: e.target.value })}
          placeholder="例如：六级, 高频词"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">附件（图片/音频/PDF）</label>
        <div 
          {...getRootProps()} 
          className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : `${cardClass} hover:bg-gray-50 dark:hover:bg-gray-700/50`
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          {isDragActive ? (
            <p>松开鼠标上传文件...</p>
          ) : (
            <p>拖拽文件到这里，或点击选择文件</p>
          )}
        </div>
        
        {JSON.parse(card.attachments || '[]').length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {JSON.parse(card.attachments || '[]').map((att, idx) => (
              <div key={idx} className="relative group">
                {att.type.startsWith('image/') ? (
                  <img src={att.url} alt="Attachment" className="w-24 h-24 object-cover rounded-lg border" />
                ) : att.type.startsWith('audio/') ? (
                  <div className="w-48 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <audio controls className="w-full" src={att.url} />
                  </div>
                ) : (
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">附件</span>
                  </a>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeAttachment(idx); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          取消
        </button>
        <button
          onClick={onSave}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          保存
        </button>
      </div>
    </div>
  );
};

// --- 主应用组件 ---
const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [currentTab, setCurrentTab] = useState('study');
  const [cards, setCards] = useState([]);
  const [dueCards, setDueCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [quizItems, setQuizItems] = useState([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [quizResults, setQuizResults] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [dailyGoal, setDailyGoal] = useState('20');
  const [newCard, setNewCard] = useState({ front: '', back: '', tags: '', attachments: '[]' });

  // 切换暗黑模式
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // 获取今日待复习卡片
  const loadDueCards = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/cards/due`);
      setDueCards(response.data);
      setCurrentCardIndex(0);
      setShowAnswer(false);
    } catch (error) {
      console.error('Failed to load due cards:', error);
    }
  }, []);

  // 获取所有卡片
  const loadAllCards = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/cards`);
      setCards(response.data);
    } catch (error) {
      console.error('Failed to load cards:', error);
    }
  }, []);

  // 获取学习报告
  const loadReport = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/report`);
      setReportData(response.data);
      setDailyGoal(response.data.daily_goal);
    } catch (error) {
      console.error('Failed to load report:', error);
    }
  }, []);

  // 获取测验题目
  const loadQuiz = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/quiz?limit=10`);
      setQuizItems(response.data);
      setCurrentQuizIndex(0);
      setSelectedAnswer('');
      setQuizResults([]);
    } catch (error) {
      console.error('Failed to load quiz:', error);
    }
  }, []);

  // 提交复习结果
  const submitReview = async (quality) => {
    if (dueCards.length === 0 || currentCardIndex >= dueCards.length) return;
    
    const cardId = dueCards[currentCardIndex].id;
    try {
      await axios.post(`${API}/cards/${cardId}/review`, { quality });
      if (currentCardIndex < dueCards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
        setShowAnswer(false);
      } else {
        // 所有卡片复习完成，重新加载
        await loadDueCards();
        setShowAnswer(false);
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
    }
  };

  // 保存卡片
  const saveCard = async (card) => {
    try {
      if (card.id) {
        // 更新现有卡片
        await axios.put(`${API}/cards/${card.id}`, card);
      } else {
        // 创建新卡片
        await axios.post(`${API}/cards`, card);
      }
      setEditingCard(null);
      setNewCard({ front: '', back: '', tags: '', attachments: '[]' });
      loadAllCards();
    } catch (error) {
      console.error('Failed to save card:', error);
    }
  };

  // 删除卡片
  const deleteCard = async (cardId) => {
    if (!window.confirm('确定要删除这张卡片吗？')) return;
    try {
      await axios.delete(`${API}/cards/${cardId}`);
      setEditingCard(null);
      loadAllCards();
      loadDueCards();
    } catch (error) {
      console.error('Failed to delete card:', error);
    }
  };

  // 保存每日目标
  const saveDailyGoal = async () => {
    try {
      await axios.post(`${API}/config`, { key: 'daily_goal', value: dailyGoal });
      loadReport();
    } catch (error) {
      console.error('Failed to save daily goal:', error);
    }
  };

  // 导出卡片
  const exportCards = () => {
    window.location.href = `${API}/cards/export`;
  };

  // 导入卡片
  const importCards = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    axios.post(`${API}/cards/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    .then(() => {
      loadAllCards();
      alert('导入成功！');
    })
    .catch((error) => {
      console.error('Import failed:', error);
      alert('导入失败：' + error.message);
    });
  };

  // 初始化数据
  useEffect(() => {
    loadDueCards();
    loadAllCards();
    loadReport();
    
    // 设置暗黑模式
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode, loadDueCards, loadAllCards, loadReport]);

  // 热键支持
  useHotkeys('space', () => setShowAnswer(!showAnswer), { enableOnFormTags: true });
  useHotkeys('1', () => submitReview(0), { enableOnFormTags: true });
  useHotkeys('2', () => submitReview(1), { enableOnFormTags: true });
  useHotkeys('3', () => submitReview(2), { enableOnFormTags: true });
  useHotkeys('4', () => submitReview(3), { enableOnFormTags: true });
  useHotkeys('5', () => submitReview(4), { enableOnFormTags: true });
  useHotkeys('n', () => setEditingCard({ ...newCard }), { enableOnFormTags: true });
  useHotkeys('Escape', () => setEditingCard(null), { enableOnFormTags: true });

  const currentCard = dueCards[currentCardIndex] || {};
  const currentQuiz = quizItems[currentQuizIndex] || {};

  // 渲染学习界面
  const renderStudyView = () => {
    if (dueCards.length === 0) {
      return (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">今日无待复习卡片</h3>
          <p className="text-gray-500 dark:text-gray-400">继续加油！</p>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {currentCardIndex + 1} / {dueCards.length}
          </span>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-6 min-h-64">
          <MarkdownRenderer content={currentCard.front || ''} />
          
          {showAnswer && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <MarkdownRenderer content={currentCard.back || ''} />
              <AttachmentPreview attachments={currentCard.attachments || '[]'} />
            </div>
          )}
        </div>

        {!showAnswer ? (
          <div className="text-center">
            <button
              onClick={() => setShowAnswer(true)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-lg font-medium"
            >
              显示答案
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((quality) => (
              <button
                key={quality}
                onClick={() => submitReview(quality)}
                className={`py-3 rounded-lg font-medium ${
                  quality === 0 || quality === 1
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : quality === 2
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : quality === 3
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {['忘记', '困难', '一般', '简单', '记得'][quality]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 渲染测验界面
  const renderQuizView = () => {
    if (quizItems.length === 0) {
      return (
        <div className="text-center py-12">
          <Brain className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-4">开始测验</h3>
          <button
            onClick={loadQuiz}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            生成测验题目
          </button>
        </div>
      );
    }

    if (currentQuizIndex >= quizItems.length) {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-12">
            <TrendingUp className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">测验完成！</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              正确率: {Math.round(
                (quizResults.filter(r => r.correct).length / quizResults.length) * 100
              )}%
            </p>
            <button
              onClick={loadQuiz}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              重新开始
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {currentQuizIndex + 1} / {quizItems.length}
          </span>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-6">
          <MarkdownRenderer content={currentQuiz.front || ''} />
          
          {currentQuiz.type === 'fill' ? (
            <div className="mt-6">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {currentQuiz.blank_answer}
              </p>
              <input
                type="text"
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                placeholder="输入答案..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const correct = selectedAnswer.trim() === currentQuiz.answer;
                    setQuizResults([...quizResults, { correct, answer: selectedAnswer, correctAnswer: currentQuiz.answer }]);
                    if (currentQuizIndex < quizItems.length - 1) {
                      setCurrentQuizIndex(currentQuizIndex + 1);
                      setSelectedAnswer('');
                    }
                  }
                }}
              />
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {currentQuiz.options?.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const correct = option === currentQuiz.answer;
                    setQuizResults([...quizResults, { correct, answer: option, correctAnswer: currentQuiz.answer }]);
                    if (currentQuizIndex < quizItems.length - 1) {
                      setCurrentQuizIndex(currentQuizIndex + 1);
                      setSelectedAnswer('');
                    }
                  }}
                  className="w-full p-4 text-left border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染报告界面
  const renderReportView = () => {
    if (!reportData) {
      return (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">总卡片数</p>
                <p className="text-2xl font-bold">{reportData.total}</p>
              </div>
              <BookOpen className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">新卡片</p>
                <p className="text-2xl font-bold">{reportData.new_cards}</p>
              </div>
              <Plus className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">今日到期</p>
                <p className="text-2xl font-bold">{reportData.due_cards}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">成熟卡片</p>
                <p className="text-2xl font-bold">{reportData.mature_cards}</p>
              </div>
              <BarChart2 className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>

        {/* 学习热力图 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">最近30天学习热力图</h3>
          <CalendarHeatmap
            startDate={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
            endDate={new Date()}
            values={reportData.heatmap.map(item => ({
              date: new Date(item.date),
              count: item.count
            }))}
            classForValue={(value) => {
              if (!value) return 'color-empty';
              return value.count > 0 ? 'color-filled' : 'color-empty';
            }}
            showWeekdayLabels={true}
          />
        </div>

        {/* 每日目标设置 */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">每日学习目标</h3>
          <div className="flex gap-4 items-center">
            <input
              type="number"
              min="1"
              max="100"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              className="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={saveDailyGoal}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染卡片管理界面
  const renderCardsView = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">卡片管理</h2>
          <div className="flex gap-2">
            <button
              onClick={() => document.getElementById('import-file').click()}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              导入
            </button>
            <input
              id="import-file"
              type="file"
              accept=".csv"
              onChange={importCards}
              className="hidden"
            />
            <button
              onClick={exportCards}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
            <button
              onClick={() => setEditingCard({ ...newCard })}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="font-medium mb-2 line-clamp-2">
                <MarkdownRenderer content={card.front} />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                <MarkdownRenderer content={card.back} />
              </div>
              {card.tags && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {card.tags.split(',').map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingCard(card)}
                  className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                >
                  编辑
                </button>
                <button
                  onClick={() => deleteCard(card.id)}
                  className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染设置界面
  const renderSettingsView = () => {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">设置</h2>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
          <h3 className="font-medium mb-4">外观</h3>
          <div className="flex items-center justify-between">
            <span>暗黑模式</span>
            <button
              onClick={toggleDarkMode}
              className={`w-12 h-6 rounded-full relative transition-colors ${
                darkMode ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  darkMode ? 'transform translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
          <h3 className="font-medium mb-4">数据管理</h3>
          <div className="space-y-3">
            <button
              onClick={exportCards}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出所有卡片
            </button>
            <button
              onClick={() => document.getElementById('import-file-settings').click()}
              className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              导入卡片
            </button>
            <input
              id="import-file-settings"
              type="file"
              accept=".csv"
              onChange={importCards}
              className="hidden"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* 顶部导航栏 */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Flashcard System</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标签页导航 */}
        <div className="flex space-x-1 mb-8 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'study', label: '学习', icon: BookOpen },
            { id: 'quiz', label: '测验', icon: Brain },
            { id: 'report', label: '报告', icon: BarChart2 },
            { id: 'cards', label: '卡片', icon: FileText },
            { id: 'settings', label: '设置', icon: Settings }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 font-medium rounded-t-lg border-b-2 transition-colors ${
                currentTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        {editingCard ? (
          <CardEditor
            card={editingCard}
            onChange={setEditingCard}
            onSave={() => saveCard(editingCard)}
            onCancel={() => setEditingCard(null)}
            onDelete={editingCard.id ? () => deleteCard(editingCard.id) : null}
          />
        ) : (
          <>
            {currentTab === 'study' && renderStudyView()}
            {currentTab === 'quiz' && renderQuizView()}
            {currentTab === 'report' && renderReportView()}
            {currentTab === 'cards' && renderCardsView()}
            {currentTab === 'settings' && renderSettingsView()}
          </>
        )}
      </div>
    </div>
  );
};

export default App;
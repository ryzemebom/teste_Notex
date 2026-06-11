// app/dashboard.tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { auth, signOut, onAuthStateChanged } from './firebaseConfig';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBG7c7AVcv6QjNARDVtnfGOyRYI6AWyZOw",
  authDomain: "notex-ca7c8.firebaseapp.com",
  projectId: "notex-ca7c8",
  storageBucket: "notex-ca7c8.firebasestorage.app",
  messagingSenderId: "92828451541",
  appId: "1:92828451541:web:79fb9b623c0f7d5277d85c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Configurar aqui o token do bot e o chat id (preencha antes de usar)
const TELEGRAM_BOT_TOKEN = '8829138057:AAGoeEIUkP-5jRnd9QTvLEEu0boyBNCFvzA';
const TELEGRAM_CHAT_ID = '1355190696';

async function sendTelegramAlertStatic(eventType: string, details: any) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('Telegram alert skipped (token/chat id not set).', eventType, details);
      return;
    }
    // prepare safe text (no Markdown) and truncate details to avoid very long messages
    const ts = new Date().toISOString();
    const makeDetailsLines = (d: any) => {
      if (d == null) return '';
      if (typeof d === 'string') return d;
      try {
        if (typeof d === 'object') {
          return Object.keys(d).map(k => `${k}: ${String((d as any)[k])}`).join('\n');
        }
        return String(d);
      } catch (e) {
        return String(d);
      }
    };
    let detailsStr = makeDetailsLines(details);
    if (detailsStr.length > 800) detailsStr = detailsStr.slice(0, 800) + '...';
    const text = `NoteX - Alerta\nEvento: ${eventType}\nHorario: ${ts}\n${detailsStr}`;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });

    if (!res.ok) {
      let body: any = await res.text();
      try { body = JSON.parse(body); } catch (_) {}
      console.log('Telegram API error', res.status, body);
    } else {
      console.log('Telegram alert sent:', eventType);
    }
  } catch (err) {
    console.log('Error sending telegram alert:', err);
  }
}

// Envia N mensagens de teste (com pequeno atraso) — usa sendTelegramAlertStatic
async function sendTelegramTestMessages(count: number = 20, delayMs: number = 300) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    Alert.alert('Telegram', 'Token ou Chat ID do Telegram não configurado.');
    return;
  }
  try {
    for (let i = 1; i <= count; i++) {
      await sendTelegramAlertStatic('test_message', { index: i, note: `mensagem de teste ${i}` });
      // delay
      await new Promise(res => setTimeout(res, delayMs));
    }
    Alert.alert('Telegram', `Enviadas ${count} mensagens de teste.`);
  } catch (err: any) {
    console.log('Erro ao enviar mensagens de teste:', err);
    Alert.alert('Telegram', `Erro ao enviar mensagens de teste: ${err?.message || err}`);
  }
}

interface Tarefa {
  id: string;
  titulo: string;
  concluida: boolean;
  data: string;
  dataEntrega: string;
  horario?: string;
  tipo?: 'prova' | 'trabalho' | 'estudo' | 'evento';
  userId: string;
}

interface Anotacao {
  id: string;
  titulo: string;
  conteudo: string;
  data: string;
  urgente?: boolean;
  userId: string;
}

export default function DashboardScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inicio');
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [mesAtual, setMesAtual] = useState(new Date());
  
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  
  const [modalTarefaVisible, setModalTarefaVisible] = useState(false);
  const [modalAnotacaoVisible, setModalAnotacaoVisible] = useState(false);
  const [modalDetalhesAnotacaoVisible, setModalDetalhesAnotacaoVisible] = useState(false);
  const [modalDataAnotacaoVisible, setModalDataAnotacaoVisible] = useState(false);
  const [dataAnotacaoTitulo, setDataAnotacaoTitulo] = useState('');
  const [dataAnotacaoConteudo, setDataAnotacaoConteudo] = useState('');
  const [dataAnotacaoUrgente, setDataAnotacaoUrgente] = useState(false);
  const [modalMarkedDatesVisible, setModalMarkedDatesVisible] = useState(false);
  const [editandoTarefa, setEditandoTarefa] = useState<Tarefa | null>(null);
  const [editandoAnotacao, setEditandoAnotacao] = useState<Anotacao | null>(null);
  const [anotacaoSelecionada, setAnotacaoSelecionada] = useState<Anotacao | null>(null);
  const [novaTarefaTitulo, setNovaTarefaTitulo] = useState('');
  const [novaTarefaDataEntrega, setNovaTarefaDataEntrega] = useState('');
  const [novaTarefaHorario, setNovaTarefaHorario] = useState('');
  const [novaTarefaTipo, setNovaTarefaTipo] = useState<'prova' | 'trabalho' | 'estudo' | 'evento'>('estudo');
  const [novaAnotacaoTitulo, setNovaAnotacaoTitulo] = useState('');
  const [novaAnotacaoConteudo, setNovaAnotacaoConteudo] = useState('');
  const [nota1, setNota1] = useState('');
  const [notaNecessaria, setNotaNecessaria] = useState<number | null>(null);
  const [statusMedia, setStatusMedia] = useState('');
  const [mensagemErroMedia, setMensagemErroMedia] = useState('');
  const [tarefasDoDia, setTarefasDoDia] = useState<Tarefa[]>([]);
  const [anotacoesDoDia, setAnotacoesDoDia] = useState<Anotacao[]>([]);
  const [modalDataVisible, setModalDataVisible] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [dataSelecionadaISO, setDataSelecionadaISO] = useState('');

  function parseAnnotationDateToISO(dateStr: string) {
    if (!dateStr) return '';
    if (dateStr.includes('-')) return dateStr; // already ISO
    if (dateStr.includes('/')) {
      const partes = dateStr.split('/');
      if (partes.length === 3) {
        const dia = partes[0].padStart(2, '0');
        const mes = partes[1].padStart(2, '0');
        return `${partes[2]}-${mes}-${dia}`;
      }
    }
    return dateStr;
  }

  const calcularMediaNotas = () => {
    setMensagemErroMedia('');
    setNotaNecessaria(null);
    setStatusMedia('');

    if (!nota1) {
      setMensagemErroMedia('Preencha a nota da 1ª etapa.');
      return;
    }

    const v1 = parseFloat(nota1.replace(',', '.'));

    if (Number.isNaN(v1) || v1 < 0 || v1 > 10) {
      setMensagemErroMedia('O valor deve estar entre 0 e 10.');
      return;
    }

    const requerida = Number((14 - v1).toFixed(1));
    setNotaNecessaria(requerida);

    if (requerida <= 0) {
      setStatusMedia('APROVADO');
    } else if (requerida > 10) {
      setStatusMedia('IMPOSSÍVEL');
    } else {
      setStatusMedia('NECESSITA');
    }
  };

  const limparNotas = () => {
    setNota1('');
    setNotaNecessaria(null);
    setStatusMedia('');
    setMensagemErroMedia('');
  };

  // Função para formatar data brasileira com máscara
  const formatarDataBrasil = (text: string) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) {
      return cleaned;
    } else if (cleaned.length <= 4) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
    }
  };

  // Função para converter data BR (dd/mm/aaaa) para ISO (aaaa-mm-dd)
  const converterDataParaISO = (dataBR: string): string => {
    const partes = dataBR.split('/');
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    return dataBR;
  };

  // Função para converter data ISO para BR
  const converterDataParaBR = (dataISO: string): string => {
    if (!dataISO) return '';
    const partes = dataISO.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataISO;
  };

  // Função para formatar horário
  const formatarHorario = (text: string) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) {
      return cleaned;
    } else if (cleaned.length <= 4) {
      return `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
    } else {
      return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
    }
  };

  // Verificar usuário logado
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        console.log('✅ Usuário logado:', user.email, 'UID:', user.uid);
        carregarDados(user.uid);
        // Telegram alert: login
        sendTelegramAlertStatic('login', { email: user.email, uid: user.uid, ts: new Date().toISOString() });
      } else {
        console.log('❌ Nenhum usuário logado');
        router.replace('/');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Carregar dados do Firestore
  function carregarDados(userId: string) {
    console.log('📡 Carregando dados para usuário:', userId);
    
    const tarefasQuery = query(collection(db, 'tarefas'), where('userId', '==', userId));
    const unsubscribeTarefas = onSnapshot(tarefasQuery, (snapshot) => {
      const tarefasList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Tarefa[];
      console.log(`📋 ${tarefasList.length} tarefas carregadas`);
      setTarefas(tarefasList);
    }, (error) => {
      console.log('❌ Erro ao carregar tarefas:', error.message);
    });

    const anotacoesQuery = query(collection(db, 'anotacoes'), where('userId', '==', userId));
    const unsubscribeAnotacoes = onSnapshot(anotacoesQuery, (snapshot) => {
      const anotacoesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Anotacao[];
      console.log(`📝 ${anotacoesList.length} anotações carregadas`);
      setAnotacoes(anotacoesList);
    }, (error) => {
      console.log('❌ Erro ao carregar anotações:', error.message);
    });

    return () => {
      unsubscribeTarefas();
      unsubscribeAnotacoes();
    };
  }

  function isTarefaProxima(dataEntrega: string): boolean {
    const hoje = new Date();
    const entrega = new Date(dataEntrega);
    const diffTime = entrega.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
  }

  function isTarefaAtrasada(dataEntrega: string): boolean {
    const hoje = new Date();
    const entrega = new Date(dataEntrega);
    return entrega < hoje;
  }

  function getTipoIcon(tipo?: string): string {
    switch (tipo) {
      case 'prova': return '📝';
      case 'trabalho': return '📄';
      case 'estudo': return '📚';
      default: return '📌';
    }
  }

  function getTipoCor(tipo?: string): string {
    switch (tipo) {
      case 'prova': return '#f44336';
      case 'trabalho': return '#2196f3';
      case 'estudo': return '#4caf50';
      default: return '#ff9800';
    }
  }

  // CRUD Tarefas com Firebase
  async function adicionarTarefa() {
    if (!novaTarefaTitulo.trim()) {
      Alert.alert('Erro', 'Digite o título da tarefa');
      return;
    }
    if (!novaTarefaDataEntrega.trim() || novaTarefaDataEntrega.length < 10) {
      Alert.alert('Erro', 'Digite a data de entrega no formato DD/MM/AAAA');
      return;
    }
    
    try {
      const dataISO = converterDataParaISO(novaTarefaDataEntrega);
      console.log('➕ Adicionando tarefa...', { 
        titulo: novaTarefaTitulo, 
        dataEntrega: dataISO, 
        horario: novaTarefaHorario,
        tipo: novaTarefaTipo,
        userId: user.uid 
      });
      
      await addDoc(collection(db, 'tarefas'), {
        titulo: novaTarefaTitulo,
        concluida: false,
        data: new Date().toLocaleDateString(),
        dataEntrega: dataISO,
        horario: novaTarefaHorario || null,
        tipo: novaTarefaTipo,
        userId: user.uid,
      });
      
      console.log('✅ Tarefa adicionada com sucesso!');
      // Telegram alert: nova tarefa
      sendTelegramAlertStatic('add_tarefa', { titulo: novaTarefaTitulo, dataEntrega: dataISO, tipo: novaTarefaTipo, userId: user.uid });
      setNovaTarefaTitulo('');
      setNovaTarefaDataEntrega('');
      setNovaTarefaHorario('');
      setNovaTarefaTipo('estudo');
      setModalTarefaVisible(false);
      setEditandoTarefa(null);
      Alert.alert('Sucesso', 'Tarefa adicionada!');
    } catch (error: any) {
      console.log('❌ Erro ao adicionar tarefa:', error.message);
      Alert.alert('Erro', `Falha ao adicionar tarefa: ${error.message}`);
    }
  }

  async function editarTarefa() {
    if (!novaTarefaTitulo.trim()) {
      Alert.alert('Erro', 'Digite o título da tarefa');
      return;
    }
    
    try {
      const tarefaRef = doc(db, 'tarefas', editandoTarefa!.id);
      const dataISO = novaTarefaDataEntrega ? converterDataParaISO(novaTarefaDataEntrega) : editandoTarefa!.dataEntrega;
      console.log('✏️ Editando tarefa:', editandoTarefa!.id);
      
      await updateDoc(tarefaRef, {
        titulo: novaTarefaTitulo,
        dataEntrega: dataISO,
        horario: novaTarefaHorario || null,
        tipo: novaTarefaTipo,
      });
      
      console.log('✅ Tarefa editada com sucesso!');
      sendTelegramAlertStatic('edit_tarefa', { id: editandoTarefa!.id, titulo: novaTarefaTitulo, dataEntrega: dataISO, userId: user.uid });
      setNovaTarefaTitulo('');
      setNovaTarefaDataEntrega('');
      setNovaTarefaHorario('');
      setNovaTarefaTipo('estudo');
      setEditandoTarefa(null);
      setModalTarefaVisible(false);
      Alert.alert('Sucesso', 'Tarefa editada!');
    } catch (error: any) {
      console.log('❌ Erro ao editar tarefa:', error.message);
      Alert.alert('Erro', 'Falha ao editar tarefa');
    }
  }

  async function alternarTarefa(id: string, concluida: boolean) {
    try {
      const tarefaRef = doc(db, 'tarefas', id);
      await updateDoc(tarefaRef, { concluida: !concluida });
      setTarefasDoDia(prev => prev.map(t => 
        t.id === id ? { ...t, concluida: !concluida } : t
      ));
    } catch (error: any) {
      console.log('❌ Erro ao alternar tarefa:', error.message);
      Alert.alert('Erro', 'Falha ao atualizar tarefa');
    }
  }

  async function deletarTarefa(id: string, fecharModalAposDeletar: boolean = false) {
    Alert.alert(
      'Deletar Tarefa',
      'Tem certeza que deseja remover esta tarefa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            const backupTarefas = tarefas;
            const backupTarefasDoDia = tarefasDoDia;
              try {
                console.log('🗑️ Deletando tarefa (iniciando otimista):', id);
                // otimista: remover da UI imediatamente
                setTarefasDoDia(prev => prev.filter(t => t.id !== id));
                setTarefas(prev => prev.filter(t => t.id !== id));
                
                const tarefaRef = doc(db, 'tarefas', id);
                await deleteDoc(tarefaRef);
                
                // atualizar a lista local consultando novamente o Firestore
                try {
                  if (user?.uid) {
                    const snap = await getDocs(query(collection(db, 'tarefas'), where('userId', '==', user.uid)));
                    const tarefasList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tarefa[];
                    setTarefas(tarefasList);
                  }
                } catch (err: any) {
                  console.log('❌ Erro ao atualizar lista de tarefas após delete:', err.message || err);
                }
                
                if (fecharModalAposDeletar) {
                  setModalDataVisible(false);
                }
                console.log('✅ Tarefa deletada com sucesso!');
                Alert.alert('Sucesso', 'Tarefa removida!');
            } catch (error: any) {
              console.log('❌ Erro ao deletar tarefa:', error.message);
              // restaurar UI caso falhe
              setTarefas(backupTarefas);
              setTarefasDoDia(backupTarefasDoDia);
              Alert.alert('Erro', `Falha ao deletar tarefa: ${error.message}`);
            }
          },
        },
      ]
    );
  }

  // CRUD Anotações com Firebase
  async function adicionarAnotacao() {
    if (!novaAnotacaoTitulo.trim()) {
      Alert.alert('Erro', 'Digite o título da anotação');
      return;
    }
    if (!novaAnotacaoConteudo.trim()) {
      Alert.alert('Erro', 'Digite o conteúdo da anotação');
      return;
    }
    
    try {
      console.log('📝 Adicionando anotação...', { 
        titulo: novaAnotacaoTitulo, 
        userId: user.uid 
      });
      
      await addDoc(collection(db, 'anotacoes'), {
        titulo: novaAnotacaoTitulo,
        conteudo: novaAnotacaoConteudo,
        data: new Date().toLocaleDateString(),
        userId: user.uid,
      });
      
      console.log('✅ Anotação adicionada com sucesso!');
      setNovaAnotacaoTitulo('');
      setNovaAnotacaoConteudo('');
      setModalAnotacaoVisible(false);
      setEditandoAnotacao(null);
      // Telegram alert: nova anotação
      sendTelegramAlertStatic('add_anotacao', { titulo: novaAnotacaoTitulo, userId: user.uid });
      Alert.alert('Sucesso', 'Anotação adicionada!');
    } catch (error: any) {
      console.log('❌ Erro ao adicionar anotação:', error.message);
      Alert.alert('Erro', 'Falha ao adicionar anotação');
    }
  }

  async function editarAnotacao() {
    if (!novaAnotacaoTitulo.trim()) {
      Alert.alert('Erro', 'Digite o título da anotação');
      return;
    }
    if (!novaAnotacaoConteudo.trim()) {
      Alert.alert('Erro', 'Digite o conteúdo da anotação');
      return;
    }
    
    try {
      const anotacaoRef = doc(db, 'anotacoes', String(editandoAnotacao!.id));
      console.log('✏️ Editando anotação:', String(editandoAnotacao!.id));
      
      await updateDoc(anotacaoRef, {
        titulo: novaAnotacaoTitulo,
        conteudo: novaAnotacaoConteudo,
      });
      
      console.log('✅ Anotação editada com sucesso!');
      setNovaAnotacaoTitulo('');
      setNovaAnotacaoConteudo('');
      setEditandoAnotacao(null);
      setModalAnotacaoVisible(false);
      sendTelegramAlertStatic('edit_anotacao', { id: editandoAnotacao!.id, titulo: novaAnotacaoTitulo, userId: user.uid });
      Alert.alert('Sucesso', 'Anotação editada!');
    } catch (error: any) {
      console.log('❌ Erro ao editar anotação:', error.message);
      Alert.alert('Erro', 'Falha ao editar anotação');
    }
  }

  async function adicionarAnotacaoParaData() {
    if (!dataAnotacaoTitulo.trim()) {
      Alert.alert('Erro', 'Digite o título da anotação');
      return;
    }
    if (!dataAnotacaoConteudo.trim()) {
      Alert.alert('Erro', 'Digite o conteúdo da anotação');
      return;
    }
    try {
      const payload = {
        titulo: dataAnotacaoTitulo,
        conteudo: dataAnotacaoConteudo,
        data: dataSelecionadaISO || new Date().toISOString().split('T')[0],
        urgente: dataAnotacaoUrgente,
        userId: user.uid,
      };
      console.log('📝 Adicionando anotação para data...', payload);
      const anotacaoRef = await addDoc(collection(db, 'anotacoes'), payload);
      setAnotacoesDoDia(prev => [...prev, { id: anotacaoRef.id, ...payload }]);
      setDataAnotacaoTitulo('');
      setDataAnotacaoConteudo('');
      setDataAnotacaoUrgente(false);
      setModalDataAnotacaoVisible(false);
      sendTelegramAlertStatic('add_anotacao_data', payload);
      Alert.alert('Sucesso', 'Anotação adicionada para a data!');
    } catch (error: any) {
      console.log('❌ Erro ao adicionar anotação para data:', error.message);
      Alert.alert('Erro', 'Falha ao adicionar anotação');
    }
  }

  async function deletarAnotacao(id: string) {
    Alert.alert(
      'Deletar Anotação',
      'Tem certeza que deseja remover esta anotação?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            const backupAnotacoes = anotacoes;
            try {
              console.log('🗑️ Deletando anotação (iniciando otimista):', id);
              setAnotacoes(prev => prev.filter(a => a.id !== id));
              const anotacaoRefToDelete = doc(db, 'anotacoes', id);
              await deleteDoc(anotacaoRefToDelete);

              // atualizar lista de anotações consultando o Firestore
              try {
                if (user?.uid) {
                  const snapA = await getDocs(query(collection(db, 'anotacoes'), where('userId', '==', user.uid)));
                  const anotacoesList = snapA.docs.map(d => ({ id: d.id, ...d.data() })) as Anotacao[];
                  setAnotacoes(anotacoesList);
                }
              } catch (err: any) {
                console.log('❌ Erro ao atualizar anotações após delete:', err.message || err);
              }

              console.log('✅ Anotação deletada com sucesso!');
              Alert.alert('Sucesso', 'Anotação removida!');
            } catch (error: any) {
              console.log('❌ Erro ao deletar anotação:', error.message);
              // restaurar UI caso falhe
              setAnotacoes(backupAnotacoes);
              Alert.alert('Erro', `Falha ao deletar anotação: ${error.message}`);
            }
          },
        },
      ]
    );
  }

  // Handlers explícitos para os botões de deletar (com log para debug)
  function handleDeleteTarefaButton(id: string, fecharModal: boolean = false) {
    console.log('🔔 Delete button pressed for tarefa:', id, 'fecharModal:', fecharModal);
    // Para debug: chamar deleção direta sem alerta
    deletarTarefaDirect(id, fecharModal);
  }

  function handleDeleteAnotacaoButton(id: string) {
    console.log('🔔 Delete button pressed for anotacao:', id);
    // Para debug: chamar deleção direta sem alerta
    deletarAnotacaoDirect(id);
  }

  async function deletarTarefaDirect(id: string, fecharModalAposDeletar: boolean = false) {
    const backupTarefas = tarefas;
    const backupTarefasDoDia = tarefasDoDia;
    try {
      console.log('🗑️ Deletando tarefa (direct):', id);
      // otimista
      setTarefasDoDia(prev => prev.filter(t => t.id !== id));
      setTarefas(prev => prev.filter(t => t.id !== id));

      const tarefaRef = doc(db, 'tarefas', id);
      await deleteDoc(tarefaRef);

      // atualizar lista
      try {
        if (user?.uid) {
          const snap = await getDocs(query(collection(db, 'tarefas'), where('userId', '==', user.uid)));
          const tarefasList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tarefa[];
          setTarefas(tarefasList);
        }
      } catch (err: any) {
        console.log('❌ Erro ao atualizar lista de tarefas após delete (direct):', err.message || err);
      }

      if (fecharModalAposDeletar) setModalDataVisible(false);
      console.log('✅ Tarefa deletada com sucesso (direct)!');
      Alert.alert('Sucesso', 'Tarefa removida!');
      sendTelegramAlertStatic('delete_tarefa', { id, userId: user?.uid });
    } catch (error: any) {
      console.log('❌ Erro ao deletar tarefa (direct):', error.message);
      setTarefas(backupTarefas);
      setTarefasDoDia(backupTarefasDoDia);
      Alert.alert('Erro', `Falha ao deletar tarefa: ${error.message}`);
    }
  }

  async function deletarAnotacaoDirect(id: string) {
    const backupAnotacoes = anotacoes;
    try {
      console.log('🗑️ Deletando anotação (direct):', id);
      setAnotacoes(prev => prev.filter(a => a.id !== id));
      setAnotacoesDoDia(prev => prev.filter(a => a.id !== id));
      const anotacaoRef = doc(db, 'anotacoes', id);
      await deleteDoc(anotacaoRef);

      // atualizar lista
      try {
        if (user?.uid) {
          const snapA = await getDocs(query(collection(db, 'anotacoes'), where('userId', '==', user.uid)));
          const anotacoesList = snapA.docs.map(d => ({ id: d.id, ...d.data() })) as Anotacao[];
          setAnotacoes(anotacoesList);
        }
      } catch (err: any) {
        console.log('❌ Erro ao atualizar anotações após delete (direct):', err.message || err);
      }

      console.log('✅ Anotação deletada com sucesso (direct)!');
      Alert.alert('Sucesso', 'Anotação removida!');
      sendTelegramAlertStatic('delete_anotacao', { id, userId: user?.uid });
    } catch (error: any) {
      console.log('❌ Erro ao deletar anotação (direct):', error.message);
      setAnotacoes(backupAnotacoes);
      setAnotacoesDoDia(backupAnotacoes.filter(a => parseAnnotationDateToISO(a.data) === dataSelecionadaISO));
      Alert.alert('Erro', `Falha ao deletar anotação: ${error.message}`);
    }
  }

  function abrirModalTarefa(tarefa?: Tarefa) {
    if (tarefa) {
      setEditandoTarefa(tarefa);
      setNovaTarefaTitulo(tarefa.titulo);
      setNovaTarefaDataEntrega(converterDataParaBR(tarefa.dataEntrega));
      setNovaTarefaHorario(tarefa.horario || '');
      setNovaTarefaTipo(tarefa.tipo || 'estudo');
    } else {
      setEditandoTarefa(null);
      setNovaTarefaTitulo('');
      setNovaTarefaDataEntrega('');
      setNovaTarefaHorario('');
      setNovaTarefaTipo('estudo');
    }
    setModalTarefaVisible(true);
  }

  function abrirModalAnotacao(anotacao?: Anotacao) {
    if (anotacao) {
      setEditandoAnotacao(anotacao);
      setNovaAnotacaoTitulo(anotacao.titulo);
      setNovaAnotacaoConteudo(anotacao.conteudo);
    } else {
      setEditandoAnotacao(null);
      setNovaAnotacaoTitulo('');
      setNovaAnotacaoConteudo('');
    }
    setModalAnotacaoVisible(true);
  }

  function abrirDetalhesAnotacao(anotacao: Anotacao) {
    setAnotacaoSelecionada(anotacao);
    setModalDetalhesAnotacaoVisible(true);
  }

  function fecharDetalhesAnotacao() {
    setModalDetalhesAnotacaoVisible(false);
    setAnotacaoSelecionada(null);
  }

  function fecharModalTarefa() {
    setModalTarefaVisible(false);
    setEditandoTarefa(null);
    setNovaTarefaTitulo('');
    setNovaTarefaDataEntrega('');
    setNovaTarefaHorario('');
    setNovaTarefaTipo('estudo');
  }

  function fecharModalAnotacao() {
    setModalAnotacaoVisible(false);
    setEditandoAnotacao(null);
    setNovaAnotacaoTitulo('');
    setNovaAnotacaoConteudo('');
  }

  async function handleLogout() {
    Alert.alert('Sair', 'Deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          console.log('🚪 Usuário deslogando:', user?.email);
          await signOut(auth);
          router.replace('/');
        },
      },
    ]);
  }

  // Gerar calendário
  function gerarCalendario() {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay();
    
    const dias = [];
    for (let i = 0; i < diaSemanaInicio; i++) {
      dias.push(null);
    }
    for (let i = 1; i <= diasNoMes; i++) {
      const dataString = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const tarefasDia = tarefas.filter(t => t.dataEntrega === dataString);
      const anotacoesDia = anotacoes.filter(a => {
        const aIso = parseAnnotationDateToISO(a.data);
        return aIso === dataString || a.data === dataString;
      });
      const temAnotacaoUrgente = anotacoesDia.some(a => a.urgente);
      const temAnotacoes = anotacoesDia.length > 0;
      const temTarefaPendente = tarefasDia.some(t => !t.concluida);
      const temTarefaProxima = tarefasDia.some(t => !t.concluida && isTarefaProxima(t.dataEntrega));
      const temTarefaAtrasada = tarefasDia.some(t => !t.concluida && isTarefaAtrasada(t.dataEntrega));
      const todasConcluidas = tarefasDia.length > 0 && tarefasDia.every(t => t.concluida);
      
      let corStatus = '';
      // Priorize anotações urgentes
      if (temAnotacaoUrgente) corStatus = 'danger';
      else if (temAnotacoes) corStatus = 'annotation';
      else if (temTarefaAtrasada) corStatus = 'danger';
      else if (temTarefaProxima) corStatus = 'warning';
      else if (temTarefaPendente) corStatus = 'pending';
      else if (todasConcluidas) corStatus = 'completed';
      
      dias.push({ 
        dia: i, 
        data: dataString, 
        corStatus,
        quantidade: tarefasDia.length + anotacoesDia.length,
        tarefas: tarefasDia,
        anotacoes: anotacoesDia,
      });
    }
    return dias;
  }

  function mudarMes(direcao: number) {
    const novoMes = new Date(mesAtual);
    novoMes.setMonth(mesAtual.getMonth() + direcao);
    setMesAtual(novoMes);
  }

  function verTarefasData(dia: any) {
    setTarefasDoDia(dia.tarefas);
    setAnotacoesDoDia(dia.anotacoes || []);
    setDataSelecionada(converterDataParaBR(dia.data));
    setDataSelecionadaISO(dia.data);
    setModalDataVisible(true);
  }

  function trocarAba(aba: string) {
    setActiveTab(aba);
    setCalendarioVisible(false);
  }

  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const tarefasPendentes = tarefas.filter(t => !t.concluida).length;
  const tarefasConcluidas = tarefas.filter(t => t.concluida).length;
  const tarefasProximas = tarefas.filter(t => !t.concluida && isTarefaProxima(t.dataEntrega)).length;
  const tarefasAtrasadas = tarefas.filter(t => !t.concluida && isTarefaAtrasada(t.dataEntrega)).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>NoteX</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => setCalendarioVisible(!calendarioVisible)} style={styles.calendarButton}>
            <Text style={styles.calendarButtonText}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModalMarkedDatesVisible(true)} style={[styles.calendarButton, { marginLeft: 8 }]}> 
            <Text style={styles.calendarButtonText}>📍</Text>
          </TouchableOpacity>


        </View>
      </View>

      <ScrollView style={styles.content}>
      {/* Calendário */}
      {calendarioVisible && (
        <View style={styles.calendarFloat}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => mudarMes(-1)} style={styles.calendarNavButton}>
              <Text style={styles.calendarNav}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.calendarTitle}>{meses[mesAtual.getMonth()]} {mesAtual.getFullYear()}</Text>
            <TouchableOpacity onPress={() => mudarMes(1)} style={styles.calendarNavButton}>
              <Text style={styles.calendarNav}>▶</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.calendarWeekDays}>
            {diasSemana.map((dia, idx) => (
              <Text key={idx} style={styles.calendarWeekDay}>{dia}</Text>
            ))}
          </View>
          
          <View style={styles.calendarDays}>
            {gerarCalendario().map((dia, idx) => (
              <TouchableOpacity 
                key={idx} 
                style={styles.calendarDay}
                onPress={() => dia && verTarefasData(dia)}
                disabled={!dia}>
                {dia ? (
                  <View style={[
                    styles.calendarDayContent,
                    dia.corStatus === 'pending' && styles.calendarDayPending,
                    dia.corStatus === 'warning' && styles.calendarDayWarning,
                    dia.corStatus === 'danger' && styles.calendarDayDanger,
                    dia.corStatus === 'annotation' && styles.calendarDayAnnotation,
                    dia.corStatus === 'completed' && styles.calendarDayCompleted,
                  ]}>
                    <Text style={[
                      styles.calendarDayText,
                      (dia.corStatus === 'danger' || dia.corStatus === 'warning') && styles.calendarDayTextBold
                    ]}>{dia.dia}</Text>
                    {dia.quantidade > 0 && (
                      <View style={styles.calendarBadge}>
                        <Text style={styles.calendarBadgeText}>{dia.quantidade}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.calendarDayEmpty} />
                )}
              </TouchableOpacity>
            ))}
          </View>
          
          <View style={styles.calendarLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.legendColorPending]} />
              <Text style={styles.legendText}>Pendente</Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.legendColorDanger]} />
              <Text style={styles.legendText}>Atrasado</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.legendColorCompleted]} />
              <Text style={styles.legendText}>Concluído</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.legendColorAnnotation]} />
              <Text style={styles.legendText}>Anotação</Text>
            </View>
          </View>
        </View>
      )}

      {/* Modal de Tarefas do Dia */}
      <Modal visible={modalDataVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 Atividades do dia {dataSelecionada}</Text>
              <TouchableOpacity onPress={() => setModalDataVisible(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {tarefasDoDia.length === 0 && anotacoesDoDia.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma atividade para este dia</Text>
            ) : (
              tarefasDoDia.map((tarefa) => (
                <View key={tarefa.id} style={styles.modalTarefaItem}>
                  <View style={[styles.modalTarefaIcon, { backgroundColor: getTipoCor(tarefa.tipo) + '20' }]}>
                    <Text style={styles.modalTarefaIconText}>{getTipoIcon(tarefa.tipo)}</Text>
                  </View>
                  <View style={styles.modalTarefaContent}>
                    <Text style={[styles.modalTarefaTitulo, tarefa.concluida && styles.tarefaConcluida]}>
                      {tarefa.titulo}
                    </Text>
                    <Text style={styles.modalTarefaData}>
                      📅 Entrega: {converterDataParaBR(tarefa.dataEntrega)}
                      {tarefa.horario && ` às ${tarefa.horario}`}
                    </Text>
                    <Text style={[styles.modalTarefaTipo, { color: getTipoCor(tarefa.tipo) }]}>
                      {getTipoIcon(tarefa.tipo)} {tarefa.tipo?.toUpperCase()}
                    </Text>
                  </View>
                  {!tarefa.concluida ? (
                    <TouchableOpacity 
                      style={styles.modalConcluirButton} 
                      onPress={() => alternarTarefa(tarefa.id, tarefa.concluida)}>
                      <Text style={styles.modalConcluirButtonText}>✓ Concluir</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.modalConcluirButton, styles.modalConcluidoButton]}>
                      <Text style={styles.modalConcluirButtonText}>✓ Concluído</Text>
                    </View>
                  )}
                  <TouchableOpacity 
                    style={styles.modalDeletarButton} 
                    onPress={() => handleDeleteTarefaButton(tarefa.id, true)}>
                    <Text style={styles.modalDeletarButtonText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            {anotacoesDoDia.length > 0 && (
              <View style={styles.modalAnotacoesContainer}>
                <Text style={styles.modalSectionTitle}>Anotações</Text>
                {anotacoesDoDia.map((anotacao) => (
                  <View key={anotacao.id} style={styles.modalAnotacaoItem}>
                    <TouchableOpacity
                      style={styles.modalAnotacaoContent}
                      activeOpacity={0.8}
                      onPress={() => abrirDetalhesAnotacao(anotacao)}>
                      <Text style={styles.anotacaoTitulo}>{anotacao.titulo}</Text>
                      <Text style={styles.anotacaoConteudo} numberOfLines={2}>{anotacao.conteudo}</Text>
                      <Text style={styles.anotacaoData}>
                        📝 {converterDataParaBR(parseAnnotationDateToISO(anotacao.data))}
                        {anotacao.urgente ? ' · Urgente' : ''}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.anotacaoActions}>
                      <TouchableOpacity onPress={() => abrirDetalhesAnotacao(anotacao)}>
                        <Text style={styles.viewIcon}>👁️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirModalAnotacao(anotacao)}>
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteAnotacaoButton(anotacao.id)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={[styles.addButtonLarge, { marginTop: 8 }]} onPress={() => {
              setDataAnotacaoTitulo('');
              setDataAnotacaoConteudo('');
              setDataAnotacaoUrgente(false);
              // dataSelecionadaISO já definido em verTarefasData
              setModalDataAnotacaoVisible(true);
            }}>
              <Text style={styles.addButtonTextLarge}>Adicionar anotação para {converterDataParaBR(dataSelecionadaISO)}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalFechar} onPress={() => setModalDataVisible(false)}>
              <Text style={styles.modalFecharText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Adicionar anotação para data selecionada */}
      <Modal visible={modalDataAnotacaoVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Nova Anotação - {converterDataParaBR(dataSelecionadaISO)}</Text>
              <TouchableOpacity onPress={() => setModalDataAnotacaoVisible(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Título"
              placeholderTextColor="#999"
              value={dataAnotacaoTitulo}
              onChangeText={setDataAnotacaoTitulo}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Conteúdo"
              placeholderTextColor="#999"
              value={dataAnotacaoConteudo}
              onChangeText={setDataAnotacaoConteudo}
              multiline
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <TouchableOpacity onPress={() => setDataAnotacaoUrgente(!dataAnotacaoUrgente)} style={[styles.tipoButton, dataAnotacaoUrgente && styles.tipoButtonActive]}>
                <Text style={styles.tipoButtonText}>{dataAnotacaoUrgente ? '🔴 Urgente' : '🟢 Normal'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalDataAnotacaoVisible(false)}>
                <Text style={styles.modalCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSalvar} onPress={async () => { await adicionarAnotacaoParaData(); }}>
                <Text style={styles.modalSalvarText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Listar datas marcadas */}
      <Modal visible={modalMarkedDatesVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📌 Datas marcadas</Text>
              <TouchableOpacity onPress={() => setModalMarkedDatesVisible(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {(() => {
                const mapDates: Record<string, { date: string; tarefas: number; anotacoes: number; urgente: boolean }> = {};
                tarefas.forEach(t => {
                  const d = t.dataEntrega;
                  if (!mapDates[d]) mapDates[d] = { date: d, tarefas: 0, anotacoes: 0, urgente: false };
                  mapDates[d].tarefas += 1;
                });
                anotacoes.forEach(a => {
                  const aIso = parseAnnotationDateToISO(a.data);
                  const d = aIso || a.data;
                  if (!mapDates[d]) mapDates[d] = { date: d, tarefas: 0, anotacoes: 0, urgente: false };
                  mapDates[d].anotacoes += 1;
                  if (a.urgente) mapDates[d].urgente = true;
                });
                const list = Object.values(mapDates).sort((x, y) => x.date.localeCompare(y.date));
                if (list.length === 0) return <Text style={styles.emptyText}>Nenhuma data marcada</Text>;
                return list.map((item) => (
                  <View key={item.date} style={[styles.card, { marginBottom: 8 }] }>
                    <Text style={styles.cardTitle}>{converterDataParaBR(item.date)}</Text>
                    <Text style={styles.resultSubText}>{item.tarefas} tarefas · {item.anotacoes} anotações</Text>
                    {item.urgente && <Text style={[styles.resultSubText, { color: '#dc2626' }]}>Urgente</Text>}
                  </View>
                ));
              })()}
            </ScrollView>
            <TouchableOpacity style={styles.modalFechar} onPress={() => setModalMarkedDatesVisible(false)}>
              <Text style={styles.modalFecharText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Conteúdo principal */}
        {activeTab === 'inicio' && (
          <View>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statCardNumber}>{tarefasPendentes}</Text>
                <Text style={styles.statCardLabel}>Pendentes</Text>
                <View style={[styles.statIndicator, styles.pendenteIndicator]} />
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardNumber}>{tarefasConcluidas}</Text>
                <Text style={styles.statCardLabel}>Concluídas</Text>
                <View style={[styles.statIndicator, styles.concluidaIndicator]} />
              </View>
              <View style={[styles.statCard, styles.warningCard]}>
                <Text style={styles.statCardNumber}>{tarefasProximas}</Text>
                <Text style={styles.statCardLabel}>Próximas</Text>
                <View style={[styles.statIndicator, styles.proximaIndicator]} />
              </View>
              <View style={[styles.statCard, styles.dangerCard]}>
                <Text style={styles.statCardNumber}>{tarefasAtrasadas}</Text>
                <Text style={styles.statCardLabel}>Atrasadas</Text>
                <View style={[styles.statIndicator, styles.atrasadaIndicator]} />
              </View>
            </View>

            {tarefas.filter(t => !t.concluida).length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>✅ Tarefas Pendentes</Text>
                  <TouchableOpacity style={styles.addButton} onPress={() => abrirModalTarefa()}>
                    <Text style={styles.addButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                
                {tarefas.filter(t => !t.concluida).slice(0, 5).map((tarefa) => (
                  <View key={tarefa.id} style={[
                    styles.tarefaItem,
                    isTarefaAtrasada(tarefa.dataEntrega) && styles.tarefaItemAtrasado,
                    isTarefaProxima(tarefa.dataEntrega) && styles.tarefaItemProximo
                  ]}>
                    <View style={[styles.tarefaIcon, { backgroundColor: getTipoCor(tarefa.tipo) + '20' }]}>
                      <Text style={styles.tarefaIconText}>{getTipoIcon(tarefa.tipo)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => alternarTarefa(tarefa.id, tarefa.concluida)}>
                      <Text style={styles.checkIcon}>⬜</Text>
                    </TouchableOpacity>
                    <View style={styles.tarefaContent}>
                      <Text style={styles.tarefaTitulo}>{tarefa.titulo}</Text>
                      <Text style={[
                        styles.tarefaData,
                        isTarefaAtrasada(tarefa.dataEntrega) && styles.textAtrasado,
                        isTarefaProxima(tarefa.dataEntrega) && styles.textProximo
                      ]}>
                        📅 {converterDataParaBR(tarefa.dataEntrega)}
                        {tarefa.horario && ` às ${tarefa.horario}`}
                        

                        {isTarefaProxima(tarefa.dataEntrega) && ' 🔔 PRÓXIMO!'}
                      </Text>
                    </View>
                    <View style={styles.tarefaActions}>
                      <TouchableOpacity onPress={() => abrirModalTarefa(tarefa)}>
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteTarefaButton(tarefa.id, false)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {anotacoes.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>📝 Anotações Recentes</Text>
                  <TouchableOpacity style={styles.addButton} onPress={() => abrirModalAnotacao()}>
                    <Text style={styles.addButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                
                {anotacoes.slice(0, 3).map((anotacao) => (
                  <TouchableOpacity
                    key={anotacao.id}
                    style={styles.anotacaoItem}
                    activeOpacity={0.8}
                    onPress={() => abrirDetalhesAnotacao(anotacao)}>
                    <View style={styles.anotacaoContent}>
                      <Text style={styles.anotacaoTitulo}>{anotacao.titulo}</Text>
                      <Text style={styles.anotacaoConteudo} numberOfLines={2}>{anotacao.conteudo}</Text>
                      <Text style={styles.anotacaoData}>{anotacao.data}</Text>
                    </View>
                    <View style={styles.anotacaoActions}>
                      <TouchableOpacity onPress={() => abrirDetalhesAnotacao(anotacao)}>
                        <Text style={styles.viewIcon}>👁️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirModalAnotacao(anotacao)}>
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteAnotacaoButton(anotacao.id)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {tarefas.filter(t => !t.concluida).length === 0 && anotacoes.length === 0 && (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>📋</Text>
                <Text style={styles.emptyStateTitle}>Nada por aqui ainda</Text>
                <Text style={styles.emptyStateText}>Adicione suas primeiras tarefas ou anotações</Text>
                <View style={styles.emptyStateButtons}>
                  <TouchableOpacity style={styles.emptyStateButton} onPress={() => abrirModalTarefa()}>
                    <Text style={styles.emptyStateButtonText}>+ Adicionar Tarefa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.emptyStateButton, styles.emptyStateButtonSecondary]} onPress={() => abrirModalAnotacao()}>
                    <Text style={styles.emptyStateButtonText}>+ Adicionar Anotação</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'checklist' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>✅ Todas as Tarefas</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => abrirModalTarefa()}>
                  <Text style={styles.addButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{tarefasPendentes}</Text>
                  <Text style={styles.statLabel}>Pendentes</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{tarefasConcluidas}</Text>
                  <Text style={styles.statLabel}>Concluídas</Text>
                </View>
              </View>
              
              {tarefas.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma tarefa</Text>
              ) : (
                tarefas.map((tarefa) => (
                  <View key={tarefa.id} style={[
                    styles.tarefaItem,
                    !tarefa.concluida && isTarefaAtrasada(tarefa.dataEntrega) && styles.tarefaItemAtrasado,
                    !tarefa.concluida && isTarefaProxima(tarefa.dataEntrega) && styles.tarefaItemProximo
                  ]}>
                    <View style={[styles.tarefaIcon, { backgroundColor: getTipoCor(tarefa.tipo) + '20' }]}>
                      <Text style={styles.tarefaIconText}>{getTipoIcon(tarefa.tipo)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => alternarTarefa(tarefa.id, tarefa.concluida)}>
                      <Text style={styles.checkIcon}>{tarefa.concluida ? '✅' : '⬜'}</Text>
                    </TouchableOpacity>
                    <View style={styles.tarefaContent}>
                      <Text style={[styles.tarefaTitulo, tarefa.concluida && styles.tarefaConcluida]}>
                        {tarefa.titulo}
                      </Text>
                      <Text style={[
                        styles.tarefaData,
                        !tarefa.concluida && isTarefaAtrasada(tarefa.dataEntrega) && styles.textAtrasado,
                        !tarefa.concluida && isTarefaProxima(tarefa.dataEntrega) && styles.textProximo
                      ]}>
                        📅 {converterDataParaBR(tarefa.dataEntrega)}
                        {tarefa.horario && ` às ${tarefa.horario}`}
                        {!tarefa.concluida && isTarefaProxima(tarefa.dataEntrega) && ' 🔔 PRÓXIMO!'}
                      </Text>
                    </View>
                    <View style={styles.tarefaActions}>
                      <TouchableOpacity onPress={() => abrirModalTarefa(tarefa)}>
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteTarefaButton(tarefa.id, false)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'anotacoes' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>📝 Todas as Anotações</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => abrirModalAnotacao()}>
                  <Text style={styles.addButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              
              {anotacoes.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma anotação</Text>
              ) : (
                anotacoes.map((anotacao) => (
                  <TouchableOpacity
                    key={anotacao.id}
                    style={styles.anotacaoItemFull}
                    activeOpacity={0.8}
                    onPress={() => abrirDetalhesAnotacao(anotacao)}>
                    <View style={styles.anotacaoContentFull}>
                      <Text style={styles.anotacaoTituloFull}>{anotacao.titulo}</Text>
                      <Text style={styles.anotacaoConteudoFull}>{anotacao.conteudo}</Text>
                      <Text style={styles.anotacaoData}>{anotacao.data}</Text>
                    </View>
                    <View style={styles.anotacaoActions}>
                      <TouchableOpacity onPress={() => abrirDetalhesAnotacao(anotacao)}>
                        <Text style={styles.viewIcon}>👁️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirModalAnotacao(anotacao)}>
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteAnotacaoButton(anotacao.id)}>
                        <Text style={styles.deleteIcon}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'calcular' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>📊 Calcular Média</Text>
                <TouchableOpacity style={styles.addButton} onPress={limparNotas}>
                  <Text style={styles.addButtonText}>C</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Digite a nota da 1ª etapa</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Nota Etapa 1"
                placeholderTextColor="#999"
                value={nota1}
                keyboardType="numeric"
                onChangeText={setNota1}
              />

              <TouchableOpacity style={styles.modalSalvar} onPress={calcularMediaNotas}>
                <Text style={styles.modalSalvarText}>Calcular</Text>
              </TouchableOpacity>

              {mensagemErroMedia ? (
                <Text style={styles.errorTextMedia}>{mensagemErroMedia}</Text>
              ) : null}

              {notaNecessaria !== null && (
                <View style={styles.resultBox}>
                  {notaNecessaria <= 0 ? (
                    <Text style={styles.mediaResultText}>Já está aprovado com a nota da 1ª etapa.</Text>
                  ) : notaNecessaria > 10 ? (
                    <Text style={styles.mediaResultText}>Mesmo com 10 na 2ª etapa, não é possível atingir média 7.</Text>
                  ) : (
                    <Text style={styles.mediaResultText}>
                      Você precisa tirar <Text style={styles.resultStrong}>{notaNecessaria.toFixed(1)}</Text> na 2ª etapa.
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Menu Inferior */}
      <View style={styles.bottomMenu}>
        <TouchableOpacity 
          style={[styles.menuButton, activeTab === 'inicio' && styles.menuButtonActive]} 
          onPress={() => trocarAba('inicio')}>
          <View style={styles.menuIconContainer}>
            <Text style={styles.menuIcon}>🏠</Text>
          </View>
          <Text style={[styles.menuText, activeTab === 'inicio' && styles.menuTextActive]}>Início</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuButton, activeTab === 'checklist' && styles.menuButtonActive]} 
          onPress={() => trocarAba('checklist')}>
          <View style={styles.menuIconContainer}>
            <Text style={styles.menuIcon}>✅</Text>
          </View>
          <Text style={[styles.menuText, activeTab === 'checklist' && styles.menuTextActive]}>Tarefas</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuButton, activeTab === 'anotacoes' && styles.menuButtonActive]} 
          onPress={() => trocarAba('anotacoes')}>
          <View style={styles.menuIconContainer}>
            <Text style={styles.menuIcon}>📝</Text>
          </View>
          <Text style={[styles.menuText, activeTab === 'anotacoes' && styles.menuTextActive]}>Anotações</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuButton, activeTab === 'calcular' && styles.menuButtonActive]} 
          onPress={() => trocarAba('calcular')}>
          <View style={styles.menuIconContainer}>
            <Text style={styles.menuIcon}>🧮</Text>
          </View>
          <Text style={[styles.menuText, activeTab === 'calcular' && styles.menuTextActive]}>Calcular Média</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Tarefa */}
      <Modal visible={modalTarefaVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editandoTarefa ? '✏️ Editar Tarefa' : '📝 Nova Tarefa'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Título da tarefa"
              placeholderTextColor="#999"
              value={novaTarefaTitulo}
              onChangeText={setNovaTarefaTitulo}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Data de entrega (DD/MM/AAAA) Ex: 10/06/2026"
              placeholderTextColor="#999"
              value={novaTarefaDataEntrega}
              onChangeText={(text) => setNovaTarefaDataEntrega(formatarDataBrasil(text))}
              keyboardType="numeric"
              maxLength={10}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Horário (HH:MM) Ex: 14:30 (opcional)"
              placeholderTextColor="#999"
              value={novaTarefaHorario}
              onChangeText={(text) => setNovaTarefaHorario(formatarHorario(text))}
              keyboardType="numeric"
              maxLength={5}
            />
            <View style={styles.tipoContainer}>
              <Text style={styles.tipoLabel}>Tipo:</Text>
              <View style={styles.tipoButtons}>
                <TouchableOpacity 
                  style={[styles.tipoButton, novaTarefaTipo === 'prova' && styles.tipoButtonActive]}
                  onPress={() => setNovaTarefaTipo('prova')}>
                  <Text style={styles.tipoButtonText}>📝 Prova</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, novaTarefaTipo === 'trabalho' && styles.tipoButtonActive]}
                  onPress={() => setNovaTarefaTipo('trabalho')}>
                  <Text style={styles.tipoButtonText}>📄 Trabalho</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, novaTarefaTipo === 'estudo' && styles.tipoButtonActive]}
                  onPress={() => setNovaTarefaTipo('estudo')}>
                  <Text style={styles.tipoButtonText}>📚 Estudo</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, novaTarefaTipo === 'evento' && styles.tipoButtonActive]}
                  onPress={() => setNovaTarefaTipo('evento')}>
                  <Text style={styles.tipoButtonText}>📌 Evento</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelar} onPress={fecharModalTarefa}>
                <Text style={styles.modalCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSalvar} onPress={editandoTarefa ? editarTarefa : adicionarTarefa}>
                <Text style={styles.modalSalvarText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Anotacao */}
      <Modal visible={modalAnotacaoVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editandoAnotacao ? '✏️ Editar Anotação' : '📝 Nova Anotação'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Título"
              placeholderTextColor="#999"
              value={novaAnotacaoTitulo}
              onChangeText={setNovaAnotacaoTitulo}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Conteúdo"
              placeholderTextColor="#999"
              value={novaAnotacaoConteudo}
              onChangeText={setNovaAnotacaoConteudo}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelar} onPress={fecharModalAnotacao}>
                <Text style={styles.modalCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSalvar} onPress={editandoAnotacao ? editarAnotacao : adicionarAnotacao}>
                <Text style={styles.modalSalvarText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Detalhes Anotacao */}
      <Modal visible={modalDetalhesAnotacaoVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Informações da Anotação</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={fecharDetalhesAnotacao}>
                <Text style={styles.modalCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            {anotacaoSelecionada && (
              <View>
                <Text style={styles.detalheLabel}>Título</Text>
                <Text style={styles.detalheTitulo}>{anotacaoSelecionada.titulo}</Text>
                <Text style={styles.detalheLabel}>Conteúdo</Text>
                <Text style={styles.detalheConteudo}>{anotacaoSelecionada.conteudo}</Text>
                <Text style={styles.detalheLabel}>Data</Text>
                <Text style={styles.detalheData}>{anotacaoSelecionada.data}</Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelar}
                    onPress={() => {
                      fecharDetalhesAnotacao();
                      abrirModalAnotacao(anotacaoSelecionada);
                    }}>
                    <Text style={styles.modalCancelarText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSalvar} onPress={fecharDetalhesAnotacao}>
                    <Text style={styles.modalSalvarText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1e49',
  },
  header: {
    backgroundColor: '#0f1e49',
    padding: 20,
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userEmail: {
    fontSize: 12,
    color: '#f97316',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  calendarButton: {
    backgroundColor: '#f97316',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarButtonText: {
    fontSize: 20,
  },
  logoutButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  calendarFloat: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  calendarNavButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    width: 40,
    alignItems: 'center',
  },
  calendarNav: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f1e49',
  },
  calendarWeekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  calendarWeekDay: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    width: 44,
    textAlign: 'center',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 4,
  },
  calendarDayContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  calendarDayPending: {
    backgroundColor: '#e3f2fd',
    borderColor: '#4a90e2',
  },
  calendarDayWarning: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  calendarDayDanger: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  calendarDayAnnotation: {
    backgroundColor: '#e0f7fa',
    borderColor: '#06b6d4',
  },
  calendarDayCompleted: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  calendarDayText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  calendarDayTextBold: {
    fontWeight: 'bold',
  },
  calendarDayEmpty: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  calendarBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#f97316',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  calendarBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 16,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  legendColorPending: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  legendColorWarning: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  legendColorDanger: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  legendColorCompleted: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  legendColorAnnotation: {
    backgroundColor: '#e0f7fa',
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  legendText: {
    fontSize: 11,
    color: '#555',
  },
  content: {
    flex: 1,
    padding: 16,
    marginBottom: 80,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '23%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  warningCard: {
    backgroundColor: '#fff3e0',
  },
  dangerCard: {
    backgroundColor: '#ffebee',
  },
  statIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 8,
    right: 8,
  },
  pendenteIndicator: {
    backgroundColor: '#4a90e2',
  },
  concluidaIndicator: {
    backgroundColor: '#4caf50',
  },
  proximaIndicator: {
    backgroundColor: '#ff9800',
  },
  atrasadaIndicator: {
    backgroundColor: '#f44336',
  },
  statCardNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statCardLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#f97316',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  addButtonLarge: {
    backgroundColor: '#06b6d4',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  addButtonTextLarge: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    minWidth: 100,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f97316',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  tarefaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tarefaItemAtrasado: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  tarefaItemProximo: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  tarefaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  tarefaIconText: {
    fontSize: 16,
  },
  checkIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  tarefaContent: {
    flex: 1,
  },
  tarefaTitulo: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  tarefaConcluida: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  tarefaData: {
    fontSize: 11,
    marginTop: 2,
  },
  textAtrasado: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  textProximo: {
    color: '#ff9800',
    fontWeight: 'bold',
  },
  tarefaActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editIcon: {
    fontSize: 18,
  },
  viewIcon: {
    fontSize: 18,
  },
  deleteIcon: {
    fontSize: 18,
  },
  anotacaoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  anotacaoItemFull: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  anotacaoContent: {
    flex: 1,
  },
  anotacaoContentFull: {
    flex: 1,
  },
  anotacaoTitulo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  anotacaoTituloFull: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  anotacaoConteudo: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  anotacaoConteudoFull: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  anotacaoData: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  anotacaoActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 12,
  },
  modalAnotacoesContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f1e49',
    marginBottom: 8,
  },
  modalAnotacaoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalAnotacaoContent: {
    flex: 1,
  },
  detalheLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#777',
    marginTop: 12,
    textTransform: 'uppercase',
  },
  detalheTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 6,
  },
  detalheConteudo: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginTop: 6,
  },
  detalheData: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 50,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButtons: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emptyStateButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  emptyStateButtonSecondary: {
    backgroundColor: '#6c757d',
  },
  emptyStateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  bottomMenu: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  menuButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  menuButtonActive: {
    backgroundColor: '#f97316',
  },
  menuIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  menuIcon: {
    fontSize: 28,
  },
  menuText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  menuTextActive: {
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f1e49',
    textAlign: 'center',
    flex: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  mediaResultText: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#0f1e49',
    textAlign: 'center',
  },
  resultBox: {
    marginTop: 16,
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#f97316',
  },
  statusBox: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  corReprovado: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
    borderWidth: 1,
  },
  corProvaFinal: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
  },
  corAprovado: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  resultSubText: {
    marginTop: 12,
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
  },
  resultStrong: {
    fontWeight: '700',
    color: '#111827',
  },
  errorTextMedia: {
    color: '#dc2626',
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalTextArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalCancelar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  modalCancelarText: {
    color: '#666',
    fontWeight: '500',
  },
  modalSalvar: {
    backgroundColor: '#f97316',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSalvarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalTarefaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTarefaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalTarefaIconText: {
    fontSize: 20,
  },
  modalTarefaContent: {
    flex: 1,
  },
  modalTarefaTitulo: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  modalTarefaData: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  modalTarefaTipo: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: 'bold',
  },
  modalConcluirButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalConcluidoButton: {
    backgroundColor: '#81c784',
  },
  modalConcluirButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalDeletarButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalDeletarButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalFechar: {
    backgroundColor: '#f97316',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  modalFecharText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  tipoContainer: {
    marginBottom: 12,
  },
  tipoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  tipoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tipoButtonActive: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  tipoButtonText: {
    fontSize: 12,
    color: '#333',
  },
});

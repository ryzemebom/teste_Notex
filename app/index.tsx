// app/index.tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Configuração direta aqui para teste
const firebaseConfig = {
  apiKey: "AIzaSyBG7c7AVcv6QjNARDVtnfGOyRYI6AWyZOw",
  authDomain: "notex-ca7c8.firebaseapp.com",
  projectId: "notex-ca7c8",
  storageBucket: "notex-ca7c8.firebasestorage.app",
  messagingSenderId: "92828451541",
  appId: "1:92828451541:web:79fb9b623c0f7d5277d85c"
};

// Inicializar Firebase diretamente aqui
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    console.log('=== INICIANDO CADASTRO ===');
    console.log('Email:', email);
    console.log('Senha:', senha);
    
    // Validações
    if (!email || !senha || !confirmarSenha) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    if (senha !== confirmarSenha) {
      Alert.alert('Erro', 'As senhas não coincidem');
      return;
    }

    if (senha.length < 6) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      console.log('Chamando createUserWithEmailAndPassword...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
      console.log('SUCESSO! Usuário criado:', userCredential.user.email);
      console.log('UID:', userCredential.user.uid);
      
      Alert.alert('Sucesso', 'Conta criada com sucesso! Faça login.');
      
      setIsRegistering(false);
      setEmail('');
      setSenha('');
      setConfirmarSenha('');
      
    } catch (error: any) {
      console.log('ERRO DETALHADO:');
      console.log('Código:', error.code);
      console.log('Mensagem:', error.message);
      
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Erro', 'Este e-mail já está cadastrado');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Erro', 'E-mail inválido. Use um formato como email@exemplo.com');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres');
      } else if (error.code === 'auth/network-request-failed') {
        Alert.alert('Erro', 'Sem conexão com a internet. Verifique sua rede.');
      } else if (error.code === 'auth/operation-not-allowed') {
        Alert.alert('Erro', 'Cadastro com email/senha não está habilitado. Vá no Firebase Console e habilite.');
      } else {
        Alert.alert('Erro', `Erro: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    console.log('=== INICIANDO LOGIN ===');
    console.log('Email:', email);
    
    if (!email || !senha) {
      Alert.alert('Erro', 'Preencha e-mail e senha');
      return;
    }

    setLoading(true);

    try {
      console.log('Chamando signInWithEmailAndPassword...');
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      console.log('SUCESSO! Login realizado:', userCredential.user.email);
      
      router.replace('./dashboard');
      
    } catch (error: any) {
      console.log('ERRO NO LOGIN:');
      console.log('Código:', error.code);
      console.log('Mensagem:', error.message);
      
      if (error.code === 'auth/user-not-found') {
        Alert.alert('Erro', 'Usuário não encontrado. Crie uma conta primeiro.');
      } else if (error.code === 'auth/wrong-password') {
        Alert.alert('Erro', 'Senha incorreta');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Erro', 'E-mail inválido');
      } else {
        Alert.alert('Erro', `Erro: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Image
          source={require('../assets/images/download.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            placeholder="Digite seu email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            placeholder="Digite sua senha"
            placeholderTextColor="#999"
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            style={styles.input}
            editable={!loading}
          />

          {isRegistering && (
            <>
              <Text style={styles.label}>Confirmar senha</Text>
              <TextInput
                placeholder="Confirme sua senha"
                placeholderTextColor="#999"
                value={confirmarSenha}
                onChangeText={setConfirmarSenha}
                secureTextEntry
                style={styles.input}
                editable={!loading}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isRegistering ? 'Criar Conta' : 'Entrar'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (!loading) {
                setIsRegistering(!isRegistering);
                setEmail('');
                setSenha('');
                setConfirmarSenha('');
              }
            }}
            disabled={loading}
          >
            <Text style={styles.link}>
              {isRegistering ? 'Já tenho uma conta' : 'Criar Conta'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#0f1e49',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f1e49',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: '100%',
    height: 150,
    marginBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  button: {
    backgroundColor: '#f97316',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#f97316aa',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  link: {
    color: '#f97316',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
  },
});
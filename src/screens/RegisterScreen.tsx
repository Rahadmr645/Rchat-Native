import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthTextField } from '../components/AuthTextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { AuthApiError } from '../network/authApi';
import { colors } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFormError(null);
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || undefined);
    } catch (e) {
      setFormError(e instanceof AuthApiError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Ionicons name="person-add-outline" size={34} color={colors.header} />
            </View>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Use your Gmail or any email. Password must be at least 8 characters.
            </Text>
          </View>

          <View style={styles.card}>
            {formError ? (
              <View style={styles.banner}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.bannerText}>{formError}</Text>
              </View>
            ) : null}

            <AuthTextField
              label="Display name (optional)"
              placeholder="How you appear in chats"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
            <AuthTextField
              label="Email"
              placeholder="you@gmail.com"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoComplete="email"
              textContentType="emailAddress"
            />
            <AuthTextField
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              secure={secure}
              showToggle
              onToggleSecure={() => setSecure((s) => !s)}
              textContentType="newPassword"
              autoComplete="password-new"
            />

            <PrimaryButton
              title="Create account"
              loading={loading}
              onPress={onSubmit}
              style={styles.cta}
            />

            <PrimaryButton
              title="Already have an account? Sign in"
              variant="ghost"
              onPress={() => navigation.navigate('Login')}
              style={styles.secondary}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E8F5F2',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  bannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  cta: {
    marginTop: 4,
  },
  secondary: {
    marginTop: 6,
  },
});

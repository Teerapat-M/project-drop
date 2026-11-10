import { useState } from 'react';
import { SafeAreaView, StyleSheet, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { nextAuthScreen, type AuthScreen } from './src/auth/gate';
import { DriverScreen } from './src/screens/DriverScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { RiderScreen } from './src/screens/RiderScreen';
import { RoleSelectScreen } from './src/screens/RoleSelectScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { themeFor } from './src/theme';
import type { AppMode } from './src/mode';

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const scheme = useColorScheme();
  const { destination, profile } = useAuth();
  const mode: AppMode = destination === 'driver' || profile?.role === 'driver' ? 'driver' : 'rider';
  const theme = themeFor(mode, scheme);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {destination === 'loading' ? (
        <View style={[styles.root, { backgroundColor: theme.colors.primary }]} />
      ) : destination === 'auth' ? (
        <AuthStack />
      ) : destination === 'role-select' ? (
        <RoleSelectScreen theme={theme} />
      ) : destination === 'driver' ? (
        <View style={styles.screen}>
          <DriverScreen theme={theme} />
        </View>
      ) : (
        <View style={styles.screen}>
          <RiderScreen theme={theme} />
        </View>
      )}
    </SafeAreaView>
  );
}

function AuthStack() {
  const scheme = useColorScheme();
  const theme = themeFor('rider', scheme);
  const [screen, setScreen] = useState<AuthScreen>('login');
  const [otpPhone, setOtpPhone] = useState('');

  if (screen === 'signup') {
    return <SignUpScreen theme={theme} onBack={() => setScreen(nextAuthScreen(screen, 'back'))} />;
  }
  if (screen === 'forgot') {
    return (
      <ForgotPasswordScreen theme={theme} onBack={() => setScreen(nextAuthScreen(screen, 'back'))} />
    );
  }
  if (screen === 'otp') {
    return (
      <OtpScreen
        theme={theme}
        phone={otpPhone}
        onBack={() => setScreen(nextAuthScreen(screen, 'back'))}
      />
    );
  }
  return (
    <LoginScreen
      theme={theme}
      onSignUp={() => setScreen('signup')}
      onForgot={() => setScreen('forgot')}
      onOtp={(phone) => {
        setOtpPhone(phone);
        setScreen('otp');
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
});

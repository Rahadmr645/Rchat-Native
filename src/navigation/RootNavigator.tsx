import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ChatsScreen } from '../screens/ChatsScreen';
import { AddFriendScreen } from '../screens/AddFriendScreen';
import { ExplorePeopleScreen } from '../screens/ExplorePeopleScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlaceholderTabScreen } from '../screens/PlaceholderTabScreen';
import { CallsScreen } from '../screens/CallsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ChatsHeaderActions } from '../components/ChatsHeaderActions';
import { NotificationEnableBanner } from '../components/NotificationEnableBanner';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { chatRoomTheme } from '../theme/chatRoomTheme';
import { fetchThreads } from '../network/chatApi';
import type { AuthStackParamList, ChatsStackParamList, MainTabParamList } from './types';

const ChatsStack = createNativeStackNavigator<ChatsStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const navigationRef = createNavigationContainerRef();

function ChatsStackNavigator() {
  const { colors } = useAppTheme();
  return (
    <ChatsStack.Navigator
      initialRouteName="ChatsList"
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.iconTint,
        headerShadowVisible: false,
        headerTitleStyle: { color: '#fff', fontWeight: '600', fontSize: 20 },
        contentStyle: { backgroundColor: colors.listBackground },
      }}
    >
      <ChatsStack.Screen
        name="ChatsList"
        component={ChatsScreen}
        options={{
          title: 'RChat',
          headerLargeTitle: Platform.OS === 'ios',
          headerRight: () => <ChatsHeaderActions />,
        }}
      />
      <ChatsStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerBackTitle: Platform.OS === 'ios' ? 'Chats' : undefined,
        }}
      />
      <ChatsStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          headerBackTitle: Platform.OS === 'ios' ? 'Chats' : undefined,
        }}
      />
      <ChatsStack.Screen
        name="AddFriend"
        component={AddFriendScreen}
        options={{
          title: 'Friend requests',
          headerBackTitle: Platform.OS === 'ios' ? 'Chats' : undefined,
        }}
      />
      <ChatsStack.Screen
        name="ExplorePeople"
        component={ExplorePeopleScreen}
        options={{
          title: 'Explore people',
          headerBackTitle: Platform.OS === 'ios' ? 'Chats' : undefined,
        }}
      />
      <ChatsStack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{
          headerTitleAlign: Platform.OS === 'android' ? 'left' : 'center',
          headerStyle: { backgroundColor: chatRoomTheme.headerBg },
          headerTintColor: '#fff',
          headerShadowVisible: false,
          contentStyle: { backgroundColor: chatRoomTheme.screenBg },
        }}
      />
    </ChatsStack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useAppTheme();
  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: colors.tabBarBackground,
      borderTopColor: colors.divider,
    }),
    [colors],
  );
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: colors.header,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="ChatsTab"
        component={ChatsStackNavigator}
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="UpdatesTab"
        options={{
          title: 'Updates',
          tabBarIcon: ({ color, size }) => <Ionicons name="radio-button-on" size={size} color={color} />,
        }}
      >
        {() => (
          <PlaceholderTabScreen
            title="Updates"
            description="Status-style stories can live here. Hook up media and a timeline when you are ready."
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen
        name="CallsTab"
        component={CallsScreen}
        options={{
          title: 'Calls',
          tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

function AuthNavigator() {
  const { colors } = useAppTheme();
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.authScreenBg },
        animation: 'fade',
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { user, ready, token } = useAuth();
  const { colors } = useAppTheme();
  const lastHandledCallIdRef = useRef<string | null>(null);

  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: colors.header,
        background: colors.listBackground,
        card: colors.cardBackground,
        text: colors.textPrimary,
        border: colors.divider,
      },
    }),
    [colors],
  );

  const openThreadFromPush = useCallback(
    async (threadId: string, media?: 'audio' | 'video', callId?: string) => {
      if (!token) return;
      let title = 'Chat';
      let subtitle = '';
      let peerAvatarLetter = '?';
      let peerAvatarUrl: string | undefined;
      let otherUserId: string | undefined;
      try {
        const threads = await fetchThreads(token);
        const thread = threads.find((t) => t.id === threadId);
        if (thread) {
          title = thread.name || title;
          subtitle = thread.lastSeen || '';
          peerAvatarLetter =
            thread.name?.trim().length > 0 ? thread.name.trim().charAt(0).toUpperCase() : thread.avatarLetter || '?';
          peerAvatarUrl = thread.avatarUrl;
          if (user?.id && thread.id.startsWith('dm:')) {
            const parts = thread.id.split(':');
            if (parts.length === 3) {
              const [, a, b] = parts;
              otherUserId = a === user.id ? b : b === user.id ? a : undefined;
            }
          }
        }
      } catch {
        /* use defaults */
      }

      navigationRef.navigate('ChatsTab' as never, {
        screen: 'ChatRoom',
        params: {
          threadId,
          title,
          subtitle,
          peerAvatarLetter,
          peerAvatarUrl,
          otherUserId,
          ...(media
            ? {
                startCallMedia: media,
                startCallNonce: Date.now(),
              }
            : {}),
        },
      } as never);

      if (callId) lastHandledCallIdRef.current = callId;
    },
    [token, user?.id],
  );

  useEffect(() => {
    if (!ready || !token || !user) return;

    const handleResponse = async (resp: Notifications.NotificationResponse | null | undefined) => {
      const data = resp?.notification?.request?.content?.data as Record<string, unknown> | undefined;
      if (!data) return;
      const type = typeof data.type === 'string' ? data.type : '';
      const threadId = typeof data.threadId === 'string' ? data.threadId : '';
      if (!threadId) return;
      if (type === 'incoming_call') {
        const media = data.media === 'video' ? 'video' : 'audio';
        const callId = typeof data.callId === 'string' ? data.callId : '';
        if (callId && lastHandledCallIdRef.current === callId) return;
        await openThreadFromPush(threadId, media, callId);
        return;
      }
      if (type === 'chat_message') {
        await openThreadFromPush(threadId);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      void handleResponse(resp);
    });
    void Notifications.getLastNotificationResponseAsync().then((resp) => {
      void handleResponse(resp);
    });
    return () => {
      sub.remove();
    };
  }, [openThreadFromPush, ready, token, user]);

  if (!ready) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.authScreenBg }]}>
        <ActivityIndicator size="large" color={colors.header} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {user && token ? (
        <View style={styles.mainShell}>
          <NotificationEnableBanner apiBearerToken={token} />
          <View style={styles.mainShellContent}>
            <MainTabs />
          </View>
        </View>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainShell: {
    flex: 1,
  },
  mainShellContent: {
    flex: 1,
  },
});

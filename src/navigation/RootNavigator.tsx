import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ChatsScreen } from '../screens/ChatsScreen';
import { AddFriendScreen } from '../screens/AddFriendScreen';
import { ExplorePeopleScreen } from '../screens/ExplorePeopleScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { PlaceholderTabScreen } from '../screens/PlaceholderTabScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ChatsHeaderActions } from '../components/ChatsHeaderActions';
import { NotificationEnableBanner } from '../components/NotificationEnableBanner';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { chatRoomTheme } from '../theme/chatRoomTheme';
import type { AuthStackParamList, ChatsStackParamList, MainTabParamList } from './types';

const ChatsStack = createNativeStackNavigator<ChatsStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const tabBarBaseStyle = {
  backgroundColor: '#F7F8FA',
  borderTopColor: colors.divider,
} as const;

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.listBackground,
  },
};

function ChatsStackNavigator() {
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
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabBarBaseStyle,
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
        options={{
          title: 'Calls',
          tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size} color={color} />,
        }}
      >
        {() => (
          <PlaceholderTabScreen
            title="Calls"
            description="Voice and video calls need a signaling server (e.g. WebRTC). This tab is ready for that flow."
          />
        )}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#E8F5F2' },
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

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.header} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
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
    backgroundColor: '#E8F5F2',
  },
  mainShell: {
    flex: 1,
  },
  mainShellContent: {
    flex: 1,
  },
});

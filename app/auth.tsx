// app/auth.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router'; // Додаємо роутер для переходів
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function AuthScreen() {
  // Стан для зберігання введених даних
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Отримуємо URL з .env на рівні компонента
  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  const handleSignUp = async () => {
    // 1. Перевірка на порожні поля
    if (!email || !password) {
      Alert.alert("Помилка", "Будь ласка, заповніть всі поля");
      return;
    }

    try {
      console.log("Відправка запиту на:", `${API_URL}/register`); // Для дебагу

      // 2. Відправка запиту на сервер
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      // 3. Обробка відповіді
      if (response.ok) {
        Alert.alert("Успіх!", "Акаунт успішно створено!");
        setEmail('');
        setPassword('');
      } else {
        Alert.alert("Помилка реєстрації", data.error || "Щось пішло не так");
      }

    } catch (error) {
      console.error("Помилка мережі:", error);
      Alert.alert("Помилка", "Не вдалося з'єднатися з сервером. Перевірте мережу та IP.");
    }
  };

  // Функція для входу (перевірка в БД)
  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Помилка", "Будь ласка, введіть email та пароль");
      return;
    }

    const API_URL = process.env.EXPO_PUBLIC_API_URL;

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // ЗБЕРІГАЄМО ТОКЕН ТА РОЛЬ У ПАМ'ЯТЬ ПРИСТРОЮ
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userRole', data.user.role);
        
        Alert.alert("Успіх!", `Ви увійшли як ${data.user.role}`);
        
        // Перекидаємо користувача на головну сторінку файлового менеджера
        router.replace('/'); 
      } else {
        Alert.alert("Помилка входу", data.error || "Неправильний логін або пароль");
      }
    } catch (error) {
      console.error("Помилка мережі:", error);
      Alert.alert("Помилка", "Не вдалося з'єднатися з сервером.");
    }
  };

  return (
    // KeyboardAvoidingView піднімає контент, коли з'являється клавіатура
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.formContainer}>
        <Text style={styles.header}>Автентифікація</Text>

        <TextInput
          style={styles.input}
          placeholder="Email адреса"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none" // Щоб перша літера не була великою автоматично
        />

        <TextInput
          style={styles.input}
          placeholder="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry // Робить пароль крапочками
        />

        {/* Кнопки */}
        <TouchableOpacity style={styles.loginButton} onPress={handleSignIn}>
          <Text style={styles.loginButtonText}>Увійти</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerButton} onPress={handleSignUp}>
          <Text style={styles.registerButtonText}>Створити акаунт</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#2c3e50',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f1f2f6',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#dfe4ea',
  },
  loginButton: {
    backgroundColor: '#3498db', // Синій для входу
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
    marginTop: 10,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3498db',
  },
  registerButtonText: {
    color: '#3498db',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function FileBrowserScreen() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  // Завантажуємо дані при старті екрану
  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      // 1. Дістаємо токен з пам'яті
      const token = await AsyncStorage.getItem('userToken');
      
      // Якщо токена немає - відправляємо на логін
      if (!token) {
        router.replace('/auth');
        return;
      }

      // 2. Робимо запит до захищеного маршруту
      const response = await fetch(`${API_URL}/files`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // <-- ОСЬ ТАК ПЕРЕДАЄТЬСЯ ТОКЕН
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        // Токен прострочений або недійсний
        await AsyncStorage.removeItem('userToken');
        router.replace('/auth');
        return;
      }

      const data = await response.json();
      
      if (response.ok) {
        setFiles(data.files);
        setUserRole(data.role); // Зберігаємо роль, щоб знати, які кнопки показувати
      }

    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- ФУНКЦІЯ ЗАВАНТАЖЕННЯ ---
  const handleUpload = async () => {
    try {
      // 1. Відкриваємо вікно вибору файлу на телефоні
      const result = await DocumentPicker.getDocumentAsync({});
      if (result.canceled) return; // Користувач передумав

      const file = result.assets[0];
      const token = await AsyncStorage.getItem('userToken');

      // 2. Пакуємо файл у формат FormData (спеціально для файлів)
      const formData = new FormData();
      formData.append('document', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any); // "as any" потрібно для TypeScript у React Native

      // 3. Відправляємо на сервер
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // УВАГА: Content-Type тут писати НЕ ТРЕБА, fetch сам його згенерує для FormData
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert('Успіх!', 'Файл завантажено');
        fetchFiles(); // Оновлюємо список файлів на екрані
      } else {
        const data = await response.json();
        Alert.alert('Помилка', data.error);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      Alert.alert('Помилка', 'Не вдалося відправити файл');
    }
  };

  // --- ФУНКЦІЯ ВИДАЛЕННЯ ---
  const handleDelete = async (fileName: string) => {
    Alert.alert(
      "Підтвердження", 
      `Видалити файл ${fileName}?`,
      [
        { text: "Скасувати", style: "cancel" },
        { 
          text: "Видалити", 
          style: "destructive",
          onPress: async () => {
            const token = await AsyncStorage.getItem('userToken');
            try {
              const response = await fetch(`${API_URL}/files/${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });

              if (response.ok) {
                fetchFiles(); // Оновлюємо список
              } else {
                const data = await response.json();
                Alert.alert('Помилка', data.error); // Якщо user спробує видалити, сервер видасть помилку
              }
            } catch (error) {
              console.error('Помилка видалення:', error);
            }
          }
        }
      ]
    );
  };

  // --- ФУНКЦІЯ ЗАВАНТАЖЕННЯ З СЕРВЕРА НА ТЕЛЕФОН ---
  const handleDownloadFromServer = async (fileName: string) => {
    try {
      Alert.alert("Завантаження...", "Будь ласка, зачекайте.");
      
      const token = await AsyncStorage.getItem('userToken');
      // Обов'язково використовуємо encodeURIComponent для файлів з пробілами!
      const downloadUrl = `${API_URL}/download/${encodeURIComponent(fileName)}`;
      
      // Створюємо тимчасовий шлях у кеші додатку на телефоні
      const localUri = `${FileSystem.documentDirectory}${fileName}`;

      // Починаємо завантаження
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localUri,
        {
          headers: {
            'Authorization': `Bearer ${token}` // Передаємо перепустку
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result && result.status === 200) {
        // Якщо скачалося успішно, відкриваємо меню "Поділитися / Зберегти"
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(result.uri);
        } else {
          Alert.alert('Готово', 'Файл завантажено в кеш');
        }
      } else {
        Alert.alert('Помилка', 'Не вдалося завантажити файл з сервера');
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      Alert.alert('Помилка', 'Щось пішло не так при завантаженні');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userRole');
    router.replace('/auth');
  };

  // Як малювати кожен файл/папку
  // Як малювати кожен файл/папку
  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.fileItem}
      // Якщо це файл (не папка), запускаємо завантаження
      onPress={() => !item.isDirectory && handleDownloadFromServer(item.name)}
      disabled={item.isDirectory} // поки не робимо перехід по папках
    >
      <MaterialCommunityIcons 
        name={item.isDirectory ? "folder" : "file-document-outline"} 
        size={40} 
        color={item.isDirectory ? "#f1c40f" : "#3498db"} 
      />
      <Text style={styles.fileName}>{item.name}</Text>
      
      {/* Кнопка видалення (ТІЛЬКИ для адміна) */}
      {userRole === 'admin' && (
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.name)}>
          <MaterialCommunityIcons name="delete" size={24} color="#e74c3c" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Мої файли</Text>
        <TouchableOpacity onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={28} color="#2c3e50" />
        </TouchableOpacity>
      </View>

      <Text style={styles.roleText}>Ви увійшли як: {userRole}</Text>

      {files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Папка порожня 📂</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          style={{ flex: 1 }} // Додаємо flex, щоб список займав доступне місце, але не виштовхував кнопку
        />
      )}

      {/* НОВЕ МІСЦЕ ДЛЯ КНОПКИ ЗАВАНТАЖЕННЯ (Внизу екрана) */}
      <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
        <MaterialCommunityIcons name="cloud-upload" size={24} color="#fff" />
        <Text style={styles.uploadButtonText}>Завантажити файл</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20, paddingTop: 60 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2c3e50' },
  roleText: { fontSize: 14, color: '#7f8c8d', marginBottom: 20 },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },
  fileName: { flex: 1, marginLeft: 15, fontSize: 16, color: '#34495e' },
  deleteBtn: { padding: 5 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#bdc3c7' },
  uploadButton: {
    flexDirection: 'row',
    backgroundColor: '#2ecc71',
    padding: 15,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30, // <--- Додали відступ знизу
    elevation: 3,
  },
  uploadButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});

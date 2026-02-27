import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';

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
      // Дістаємо токен з пам'яті
      const token = await AsyncStorage.getItem('userToken');
      
      // Якщо токена немає - відправляємо на логін
      if (!token) {
        router.replace('/auth');
        return;
      }

      // Робимо запит до захищеного маршруту
      const response = await fetch(`${API_URL}/files`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // ТУТ ПЕРЕДАЄТЬСЯ ТОКЕН
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

  // ФУНКЦІЯ ВИВАНТАЖЕННЯ (UPLOAD) 
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({});
      if (result.canceled) return; 

      const file = result.assets[0];
      const token = await AsyncStorage.getItem('userToken');

      const formData = new FormData();

      // ЛОГІКА ДЛЯ БРАУЗЕРА ТА ТЕЛЕФОНІВ
      if (Platform.OS === 'web' && file.file) {
        // "&& file.file", щоб TS був впевнений, що він існує
        formData.append('document', file.file as File);
      } else {
        // На телефоні передаємо спеціальний об'єкт із посиланням (uri)
        formData.append('document', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        } as any); 
      }

      // Відправляємо на сервер
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert('Успіх!', 'Файл завантажено');
        fetchFiles(); // Оновлюємо список
      } else {
        const data = await response.json();
        Alert.alert('Помилка', data.error);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      Alert.alert('Помилка', 'Не вдалося відправити файл');
    }
  };

  // ФУНКЦІЯ ВИДАЛЕННЯ 
  const handleDelete = async (fileName: string) => {
    
    // Сама логіка видалення (універсальна для всіх платформ)
    const executeDelete = async () => {
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
          Alert.alert('Помилка', data.error || 'Не вдалося видалити файл');
        }
      } catch (error) {
        console.error('Помилка видалення:', error);
      }
    };

    //  ЛОГІКА ДІАЛОГОВОГО ВІКНА ДЛЯ БРАУЗЕРА (ПК)
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Видалити файл ${fileName}?`);
      if (confirmed) {
        executeDelete();
      }
    } 
    // ЛОГІКА ДІАЛОГОВОГО ВІКНА ДЛЯ ТЕЛЕФОНІВ
    else {
      Alert.alert(
        "Підтвердження", 
        `Видалити файл ${fileName}?`,
        [
          { text: "Скасувати", style: "cancel" },
          { text: "Видалити", style: "destructive", onPress: executeDelete }
        ]
      );
    }
  };

  // ФУНКЦІЯ ЗАВАНТАЖЕННЯ З СЕРВЕРА НА ТЕЛЕФОН / ПК 
  const handleDownloadFromServer = async (fileName: string) => {
    try {
      Alert.alert("Завантаження...", "Будь ласка, зачекайте.");
      
      const token = await AsyncStorage.getItem('userToken');
      const downloadUrl = `${API_URL}/download/${encodeURIComponent(fileName)}`;

      // ЛОГІКА ДЛЯ БРАУЗЕРА (ПК)
      if (Platform.OS === 'web') {
        const response = await fetch(downloadUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Помилка сервера при віддачі файлу');

        // Перетворюємо відповідь на файл (Blob)
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Створюємо невидиме посилання 
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        
        // Прибираємо за собою
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
      } 
      // ЛОГІКА ДЛЯ МОБІЛЬНИХ (Android / iOS)
      else {
        const localUri = `${FileSystem.documentDirectory}${fileName}`;

        const downloadResumable = FileSystem.createDownloadResumable(
          downloadUrl,
          localUri,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const result = await downloadResumable.downloadAsync();

        if (result && result.status === 200) {
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(result.uri);
          } else {
            Alert.alert('Готово', 'Файл завантажено в кеш');
          }
        } else {
          Alert.alert('Помилка', 'Не вдалося завантажити файл з сервера');
        }
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
      disabled={item.isDirectory} 
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

      {/* МІСЦЕ ДЛЯ КНОПКИ ЗАВАНТАЖЕННЯ (Внизу екрана) */}
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
    marginBottom: 30,
    elevation: 3,
  },
  uploadButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});

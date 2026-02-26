import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      {/* Налаштування головної сторінки */}
      <Stack.Screen 
        name="index" 
        options={{ title: 'Головна', headerShown: false }} // headerShown: false ховає верхню смугу, бо у нас свій заголовок
      />
      
      {/* Налаштування сторінки Settings */}
      <Stack.Screen 
        name="settings" 
        options={{ 
          title: 'Налаштування', 
          headerShown: true, // Тут покажемо стандартну смугу зі стрілкою
          headerBackTitle: 'Назад' // Текст біля стрілки (для iOS)
        }} 
      />
    </Stack>
  );
}
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createIco() {
  const inputPath = path.join(__dirname, '../public/icon.png');
  const outputPath = path.join(__dirname, '../public/icon.ico');
  
  // Размеры для ICO файла
  const sizes = [16, 32, 48, 256];
  
  try {
    // Читаем исходное изображение
    const image = sharp(inputPath);
    
    // Создаем буферы для каждого размера
    const buffers = await Promise.all(
      sizes.map(size => 
        image.clone()
          .resize(size, size)
          .png()
          .toBuffer()
      )
    );
    
    // Записываем ICO файл (упрощенная версия)
    // Для полноценного ICO нужен специальный пакет
    console.log('Изображения подготовлены для размеров:', sizes);
    console.log('Используйте пакет icojs или онлайн-конвертер для создания финального .ico файла');
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

createIco();
'use strict';

// Справочник юрлиц (ИП) и их брендов.
// В отправке ИП выбирается только из этого списка, бренд подставляется отсюда.
// Если у ИП один бренд — он ставится сам, если несколько — выбирается из них.
// Бренды взяты из таблицы «Отправки»; у кого список пуст — бренд пока вписывается вручную.
const LEGAL_ENTITIES = [
  { owner: 'ИП Темирова Ассоль', brands: ['ASSO COLLECTION'] },
  { owner: 'ИП Нурланов Т.', brands: [] },
  { owner: 'ИП Темиров Акжол', brands: ['DRESS UP'] },
  { owner: 'ИП Бекболотов Б.', brands: [] },
  { owner: 'ИП Эмиров Б.', brands: ['Heavenly style'] },
  { owner: 'ИП Нурланова А.', brands: ['AESTA'] },
  { owner: 'ИП Нурланов Э.', brands: ['By Alsu'] },
  { owner: 'ИП Бекболотова С. О.', brands: [] },
  { owner: 'ИП Чойбекова', brands: ['RUMAX'] },
  { owner: 'ИП Джуматаева Т.', brands: ['LINEA'] },
  { owner: 'ИП Бекишов Р.', brands: [] },
  { owner: 'ИП Тюлькубаев Д.', brands: ['MAIASU'] },
  { owner: 'ИП Тулкумбаев А.', brands: [] },
];

module.exports = { LEGAL_ENTITIES };

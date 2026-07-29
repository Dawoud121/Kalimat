// v2.8.0
import { api } from '../lib/api'

// ===== BUILT-IN DECK DEFINITIONS =====
export const BUILT_IN_DECKS = [
  {
    title: 'Bayna Yadayk — Chapter 1',
    description: 'Core vocabulary from Between Your Hands (بين يديك), Chapter 1',
    words: [
      // VERBS
      { arabic: 'نَظَرَ',   english: 'to look',                root: 'ن ظ ر', partOfSpeech: 'verb' },
      { arabic: 'اِسْتَمَعَ', english: 'to listen',             root: 'س م ع', partOfSpeech: 'verb' },
      { arabic: 'أَعَادَ',  english: 'to repeat',               root: 'ع و د', partOfSpeech: 'verb' },
      { arabic: 'أَشَارَ',  english: 'to point, indicate',      root: 'ش و ر', partOfSpeech: 'verb' },
      { arabic: 'وَضَعَ',   english: 'to put',                  root: 'و ض ع', partOfSpeech: 'verb' },
      { arabic: 'سَمِعَ',   english: 'to hear',                 root: 'س م ع', partOfSpeech: 'verb' },
      { arabic: 'قَالَ',    english: 'to say',                  root: 'ق و ل', partOfSpeech: 'verb' },
      { arabic: 'رَتَّبَ',  english: 'to arrange, organise',    root: 'ر ت ب', partOfSpeech: 'verb' },
      { arabic: 'تَبَادَلَ', english: 'to exchange',            root: 'ب د ل', partOfSpeech: 'verb' },
      { arabic: 'سَأَلَ',   english: 'to ask',                  root: 'س أ ل', partOfSpeech: 'verb' },
      { arabic: 'أَجَابَ',  english: 'to answer',               root: 'ج و ب', partOfSpeech: 'verb' },
      { arabic: 'قَرَأَ',   english: 'to read',                 root: 'ق ر أ', partOfSpeech: 'verb' },
      { arabic: 'مَرَّ',    english: 'to pass by',              root: 'م ر ر', partOfSpeech: 'verb' },
      { arabic: 'نَسَخَ',   english: 'to copy',                 root: 'ن س خ', partOfSpeech: 'verb' },
      // NOUNS
      { arabic: 'طَالِب',   english: 'student',                 root: 'ط ل ب', partOfSpeech: 'noun' },
      { arabic: 'كِتَاب',   english: 'book',                    root: 'ك ت ب', partOfSpeech: 'noun' },
      { arabic: 'وَحْدَة',  english: 'chapter/unit',            root: 'و ح د', partOfSpeech: 'noun' },
      { arabic: 'لُغَة',    english: 'language',                root: 'ل غ و', partOfSpeech: 'noun' },
      { arabic: 'جِنْسِيَّة', english: 'nationality',           root: 'ج ن س', partOfSpeech: 'noun' },
      { arabic: 'اِسْم',    english: 'name',                    root: 'س م و', partOfSpeech: 'noun' },
      { arabic: 'أَخ',      english: 'brother',                 root: 'أ خ و', partOfSpeech: 'noun' },
      { arabic: 'مُدَرِّس', english: 'teacher',                 root: 'د ر س', partOfSpeech: 'noun' },
      { arabic: 'صَدِيق',   english: 'friend',                  root: 'ص د ق', partOfSpeech: 'noun' },
      { arabic: 'مُهَنْدِس', english: 'engineer',               root: 'ه ن د س', partOfSpeech: 'noun' },
      { arabic: 'طَبِيب',   english: 'doctor',                  root: 'ط ب ب', partOfSpeech: 'noun' },
      { arabic: 'أُخْت',    english: 'sister',                  root: 'أ خ ت', partOfSpeech: 'noun' },
      { arabic: 'دَرْس',    english: 'lesson',                  root: 'د ر س', partOfSpeech: 'noun' },
      { arabic: 'تَدْرِيب', english: 'exercise',                root: 'د ر ب', partOfSpeech: 'noun' },
      { arabic: 'عَدَد',    english: 'number',                  root: 'ع د د', partOfSpeech: 'noun' },
      { arabic: 'صُورَة',   english: 'picture',                 root: 'ص و ر', partOfSpeech: 'noun' },
      { arabic: 'جَوَاب',   english: 'answer',                  root: 'ج و ب', partOfSpeech: 'noun' },
      { arabic: 'سُؤَال',   english: 'question',                root: 'س أ ل', partOfSpeech: 'noun' },
      { arabic: 'مِثَال',   english: 'example',                 root: 'م ث ل', partOfSpeech: 'noun' },
      { arabic: 'زَمِيل',   english: 'colleague/classmate',     root: 'ز م ل', partOfSpeech: 'noun' },
      { arabic: 'رَقْم',    english: 'number (digit)',          root: 'ر ق م', partOfSpeech: 'noun' },
      { arabic: 'جُمْلَة',  english: 'sentence',                root: 'ج م ل', partOfSpeech: 'noun' },
      { arabic: 'عَلَامَة', english: 'sign/indication',         root: 'ع ل م', partOfSpeech: 'noun' },
      { arabic: 'كَلِمَة',  english: 'word',                    root: 'ك ل م', partOfSpeech: 'noun' },
    ],
  },
  {
    title: 'Bayna Yadayk — Chapter 2',
    description: 'Vocabulary from Between Your Hands (بين يديك), Chapter 2',
    words: [
      { arabic: 'تَوَضَّأَ', english: 'to perform wudoo',       root: 'و ض أ', partOfSpeech: 'verb' },
      { arabic: 'صَلَّى',    english: 'to pray',                root: 'ص ل و', partOfSpeech: 'verb' },
      { arabic: 'فَعَلَ',    english: 'to do',                  root: 'ف ع ل', partOfSpeech: 'verb' },
      { arabic: 'عَمّ',      english: 'paternal uncle',         root: 'ع م م', partOfSpeech: 'noun' },
      { arabic: 'أُسْرَة',  english: 'family',                  root: 'أ س ر', partOfSpeech: 'noun' },
      { arabic: 'عَمَّة',   english: 'paternal aunt',           root: 'ع م م', partOfSpeech: 'noun' },
      { arabic: 'وَالِدَة', english: 'mother',                   root: 'و ل د', partOfSpeech: 'noun' },
      { arabic: 'جَدَّة',   english: 'grandmother',             root: 'ج د د', partOfSpeech: 'noun' },
      { arabic: 'جَدّ',     english: 'grandfather',             root: 'ج د د', partOfSpeech: 'noun' },
      { arabic: 'اِبْن',    english: 'son',                     root: 'ب ن و', partOfSpeech: 'noun' },
      { arabic: 'اِبْنَة',  english: 'daughter',                root: 'ب ن و', partOfSpeech: 'noun' },
      { arabic: 'مُعَلِّم', english: 'teacher',                 root: 'ع ل م', partOfSpeech: 'noun' },
      { arabic: 'وَلَد',    english: 'child/boy',               root: 'و ل د', partOfSpeech: 'noun' },
      { arabic: 'شَجَرَة',  english: 'tree',                    root: 'ش ج ر', partOfSpeech: 'noun' },
      { arabic: 'حَمَّام',  english: 'bathroom',                root: 'ح م م', partOfSpeech: 'noun' },
      { arabic: 'مِعْطَف',  english: 'coat',                    root: 'ع ط ف', partOfSpeech: 'noun' },
      { arabic: 'غُرْفَة',  english: 'room',                    root: 'غ ر ف', partOfSpeech: 'noun' },
      { arabic: 'مَسْجِد',  english: 'mosque',                  root: 'س ج د', partOfSpeech: 'noun' },
      { arabic: 'نَظَّارَة', english: 'glasses',                root: 'ن ظ ر', partOfSpeech: 'noun' },
      { arabic: 'أَب',      english: 'father',                  root: 'أ ب و', partOfSpeech: 'noun' },
      { arabic: 'رَسُول',   english: 'messenger',               root: 'ر س ل', partOfSpeech: 'noun' },
      { arabic: 'أُمّ',     english: 'mother',                  root: 'أ م م', partOfSpeech: 'noun' },
      { arabic: 'وَالِد',   english: 'father',                  root: 'و ل د', partOfSpeech: 'noun' },
    ],
  },
  {
    title: 'Bayna Yadayk — Chapter 3',
    description: 'Vocabulary from Between Your Hands (بين يديك), Chapter 3',
    words: [
      { arabic: 'سَكَنَ',   english: 'to live',                 root: 'س ك ن', partOfSpeech: 'verb' },
      { arabic: 'أَرَادَ',  english: 'to want',                 root: 'ر و د', partOfSpeech: 'verb' },
      { arabic: 'ثَلَّاجَة', english: 'fridge',                 root: 'ث ل ج', partOfSpeech: 'noun' },
      { arabic: 'مَسْكَن',  english: 'residence',               root: 'س ك ن', partOfSpeech: 'noun' },
      { arabic: 'حَيّ',     english: 'area/district',           root: 'ح ي و', partOfSpeech: 'noun' },
      { arabic: 'سَخَّان',  english: 'boiler',                  root: 'س خ ن', partOfSpeech: 'noun' },
      { arabic: 'مِرْآة',  english: 'mirror',                   root: 'ر أ ي', partOfSpeech: 'noun' },
      { arabic: 'جَامِعَة', english: 'university',              root: 'ج م ع', partOfSpeech: 'noun' },
      { arabic: 'بَيْت',    english: 'house',                   root: 'ب ي ت', partOfSpeech: 'noun' },
      { arabic: 'مَطَار',   english: 'airport',                 root: 'ط ي ر', partOfSpeech: 'noun' },
      { arabic: 'شَقَّة',   english: 'apartment',               root: 'ش ق ق', partOfSpeech: 'noun' },
      { arabic: 'دَوْر',    english: 'floor/storey',            root: 'د و ر', partOfSpeech: 'noun' },
      { arabic: 'سِتَارَة', english: 'curtains',                root: 'س ت ر', partOfSpeech: 'noun' },
      { arabic: 'سَرِير',   english: 'bed',                     root: 'س ر ر', partOfSpeech: 'noun' },
      { arabic: 'سَجَّادَة', english: 'rug',                    root: 'س ج د', partOfSpeech: 'noun' },
      { arabic: 'أَرِيكَة', english: 'sofa',                    root: 'أ ر ك', partOfSpeech: 'noun' },
      { arabic: 'فُرْن',    english: 'oven',                    root: 'ف ر ن', partOfSpeech: 'noun' },
      { arabic: 'مَطْبَخ',  english: 'kitchen',                 root: 'ط ب خ', partOfSpeech: 'noun' },
    ],
  },
  {
    title: 'Bayna Yadayk — Chapter 4',
    description: 'Vocabulary from Between Your Hands (بين يديك), Chapter 4',
    words: [
      { arabic: 'نَامَ',       english: 'to sleep',             root: 'ن و م', partOfSpeech: 'verb' },
      { arabic: 'اِسْتَيْقَظَ', english: 'to wake up',          root: 'ي ق ظ', partOfSpeech: 'verb' },
      { arabic: 'ذَهَبَ',     english: 'to go',                 root: 'ذ ه ب', partOfSpeech: 'verb' },
      { arabic: 'كَنَسَ',     english: 'to vacuum',             root: 'ك ن س', partOfSpeech: 'verb' },
      { arabic: 'غَسَلَ',     english: 'to wash',               root: 'غ س ل', partOfSpeech: 'verb' },
      { arabic: 'كَوَى',      english: 'to iron',               root: 'ك و ي', partOfSpeech: 'verb' },
      { arabic: 'شَاهَدَ',    english: 'to watch',              root: 'ش ه د', partOfSpeech: 'verb' },
      { arabic: 'سَيَّارَة',  english: 'car',                   root: 'س ي ر', partOfSpeech: 'noun' },
      { arabic: 'صَلَاة',     english: 'prayer',                root: 'ص ل و', partOfSpeech: 'noun' },
      { arabic: 'حَافِلَة',   english: 'bus',                   root: 'ح ف ل', partOfSpeech: 'noun' },
      { arabic: 'مَدْرَسَة',  english: 'school',                root: 'د ر س', partOfSpeech: 'noun' },
      { arabic: 'سَاعَة',     english: 'hour/clock',            root: 'س و ع', partOfSpeech: 'noun' },
      { arabic: 'عُطْلَة',    english: 'holiday',               root: 'ع ط ل', partOfSpeech: 'noun' },
      { arabic: 'صَحِيفَة',   english: 'newspaper',             root: 'ص ح ف', partOfSpeech: 'noun' },
      { arabic: 'تِلْفَاز',   english: 'television',            root: 'ت ل ف', partOfSpeech: 'noun' },
      { arabic: 'طَبَق',      english: 'plate/dish',            root: 'ط ب ق', partOfSpeech: 'noun' },
    ],
  },
  {
    title: 'Bayna Yadayk — Chapter 5',
    description: 'Vocabulary from Between Your Hands (بين يديك), Chapter 5',
    words: [
      { arabic: 'أَكَلَ',    english: 'to eat',                 root: 'أ ك ل', partOfSpeech: 'verb' },
      { arabic: 'طَلَبَ',    english: 'to request/order',       root: 'ط ل ب', partOfSpeech: 'verb' },
      { arabic: 'فَضَّلَ',   english: 'to prefer',              root: 'ف ض ل', partOfSpeech: 'verb' },
      { arabic: 'شَرِبَ',    english: 'to drink',               root: 'ش ر ب', partOfSpeech: 'verb' },
      { arabic: 'حَوَّلَ',   english: 'to change/convert',      root: 'ح و ل', partOfSpeech: 'verb' },
      { arabic: 'مَاء',      english: 'water',                  root: 'م و ه', partOfSpeech: 'noun' },
      { arabic: 'شَرَاب',    english: 'drink',                  root: 'ش ر ب', partOfSpeech: 'noun' },
      { arabic: 'تَمْرَة',   english: 'date',                   root: 'ت م ر', partOfSpeech: 'noun' },
      { arabic: 'طَعَام',    english: 'food',                   root: 'ط ع م', partOfSpeech: 'noun' },
      { arabic: 'لَحْم',     english: 'meat',                   root: 'ل ح م', partOfSpeech: 'noun' },
      { arabic: 'وَجْبَة',   english: 'meal',                   root: 'و ج ب', partOfSpeech: 'noun' },
      { arabic: 'عِنَب',     english: 'grapes',                 root: 'ع ن ب', partOfSpeech: 'noun' },
      { arabic: 'دَجَاجَة',  english: 'chicken',                root: 'د ج ج', partOfSpeech: 'noun' },
      { arabic: 'سَلَطَة',   english: 'salad',                  root: 'س ل ط', partOfSpeech: 'noun' },
      { arabic: 'سَمَكَة',   english: 'fish',                   root: 'س م ك', partOfSpeech: 'noun' },
      { arabic: 'مَائِدَة',  english: 'table',                  root: 'م و د', partOfSpeech: 'noun' },
      { arabic: 'فَاكِهَة',  english: 'fruit',                  root: 'ف ك ه', partOfSpeech: 'noun' },
      { arabic: 'وَزْن',     english: 'weight',                 root: 'و ز ن', partOfSpeech: 'noun' },
      { arabic: 'ضَيْف',     english: 'guest',                  root: 'ض ي ف', partOfSpeech: 'noun' },
      { arabic: 'يَوْم',     english: 'day',                    root: 'ي و م', partOfSpeech: 'noun' },
    ],
  },
]

/**
 * Seed Bayna Yadayk chapters as shared community decks.
 * Call this once from Settings (teacher only). Idempotent — skips if already seeded.
 * @param {string} userId - uploader UUID
 * @param {string} username - uploader display name
 */
export async function seedCommunityDecks(userId, username) {
  // Check if already seeded to stay idempotent
  const existing = await api.get('/community/decks')
  if (existing?.length > 0) return { alreadySeeded: true }

  for (const deckDef of BUILT_IN_DECKS) {
    await api.post('/community/decks', {
      title:              deckDef.title,
      description:        deckDef.description,
      uploader_username:  username || 'Kalimat Team',
      words_json:         deckDef.words,
    })
  }

  return { alreadySeeded: false }
}

import {
  compareEntriesNewestFirst,
  emptyEntryForm,
  entryToForm,
  formatPeriod,
  normalizeLines,
  parseEntryForm,
  parsePeriodInput,
  parsePersonalForm,
  parseProfileDraft,
  personalToForm,
  profileToInput,
  summarizeProfileInput,
  type Profile,
} from '@/domain/profile';

describe('formatPeriod', () => {
  it('zeigt Zeiträume wie im Lebenslauf', () => {
    expect(formatPeriod({ startDate: '2023-05', endDate: '2026-10', isCurrent: false })).toBe(
      '05/2023 – 10/2026',
    );
    expect(formatPeriod({ startDate: '2025-10', isCurrent: true })).toBe('seit 10/2025');
    expect(formatPeriod({ startDate: '2013', endDate: '2013', isCurrent: false })).toBe('2013');
    expect(formatPeriod({ startDate: '1998', endDate: '2000', isCurrent: false })).toBe(
      '1998 – 2000',
    );
    expect(formatPeriod({ endDate: '2024-10', isCurrent: false })).toBe('bis 10/2024');
    expect(formatPeriod({ isCurrent: false })).toBe('');
  });
});

describe('parsePeriodInput', () => {
  it('versteht Monat/Jahr, Jahr und ISO-Form', () => {
    expect(parsePeriodInput('05/2023')).toBe('2023-05');
    expect(parsePeriodInput('5/2023')).toBe('2023-05');
    expect(parsePeriodInput('5.2023')).toBe('2023-05');
    expect(parsePeriodInput('2023-05')).toBe('2023-05');
    expect(parsePeriodInput(' 2013 ')).toBe('2013');
    expect(parsePeriodInput('')).toBeUndefined();
  });

  it('lehnt Unsinn ab', () => {
    expect(parsePeriodInput('13/2023')).toBeNull();
    expect(parsePeriodInput('Mai 2023')).toBeNull();
    expect(parsePeriodInput('23')).toBeNull();
  });
});

describe('parseEntryForm', () => {
  it('liefert eine Station mit Zeitraum und bereinigten Stichpunkten', () => {
    expect(
      parseEntryForm(
        {
          ...emptyEntryForm(),
          title: ' Senior Fullstack-Entwickler ',
          organization: 'Region10Group GmbH',
          location: 'Ingolstadt',
          description: '• React und Next.js\n\n- Node.js ',
          startDate: '05/2023',
          endDate: '10/2026',
        },
        'experience',
      ),
    ).toEqual({
      ok: true,
      value: {
        title: 'Senior Fullstack-Entwickler',
        organization: 'Region10Group GmbH',
        location: 'Ingolstadt',
        description: 'React und Next.js\nNode.js',
        startDate: '2023-05',
        endDate: '2026-10',
        isCurrent: false,
      },
    });
  });

  it('ignoriert das Ende bei laufenden Stationen', () => {
    expect(
      parseEntryForm(
        {
          ...emptyEntryForm(),
          title: 'Bachelor',
          startDate: '10/2025',
          endDate: 'egal',
          isCurrent: true,
        },
        'education',
      ),
    ).toEqual({ ok: true, value: { title: 'Bachelor', startDate: '2025-10', isCurrent: true } });
  });

  it('meldet fehlenden Titel, ungültige Zeiträume und Ende vor Beginn', () => {
    expect(parseEntryForm({ ...emptyEntryForm(), startDate: 'Mai' }, 'experience')).toEqual({
      ok: false,
      errors: {
        title: 'Bitte die Position eingeben',
        startDate: 'Bitte als MM/JJJJ oder JJJJ eingeben',
      },
    });
    expect(
      parseEntryForm(
        { ...emptyEntryForm(), title: 'X', startDate: '2020', endDate: '12/2019' },
        'education',
      ),
    ).toEqual({ ok: false, errors: { endDate: 'Das Ende liegt vor dem Beginn' } });
  });

  it('macht aus einer Station wieder Formularwerte', () => {
    expect(
      entryToForm({ title: 'X', startDate: '2023-05', endDate: '2024', isCurrent: false }),
    ).toEqual({
      ...emptyEntryForm(),
      title: 'X',
      startDate: '05/2023',
      endDate: '2024',
    });
  });
});

describe('parsePersonalForm', () => {
  it('verlangt Vor- und Nachname und prüft E-Mail und Geburtsdatum', () => {
    expect(
      parsePersonalForm({ ...personalToForm({}), email: 'kein-mail', birthDate: '11.01.1976' }),
    ).toEqual({
      ok: false,
      errors: {
        firstName: 'Bitte den Vornamen eingeben',
        lastName: 'Bitte den Nachnamen eingeben',
        email: 'Bitte eine gültige E-Mail-Adresse eingeben',
        birthDate: 'Bitte ein gültiges Datum eingeben',
      },
    });
  });

  it('lässt leere optionale Felder weg', () => {
    expect(
      parsePersonalForm({
        ...personalToForm({}),
        firstName: 'Erika',
        lastName: 'Muster',
        city: ' ',
      }),
    ).toEqual({ ok: true, value: { firstName: 'Erika', lastName: 'Muster' } });
  });
});

describe('compareEntriesNewestFirst', () => {
  it('sortiert laufende zuerst, dann nach Ende absteigend', () => {
    const entries = [
      { title: 'alt', startDate: '2000', endDate: '2002', isCurrent: false },
      { title: 'aktuell', startDate: '2025-10', isCurrent: true },
      { title: 'mittel', startDate: '2014-11', endDate: '2022-02', isCurrent: false },
    ];
    expect([...entries].sort(compareEntriesNewestFirst).map((e) => e.title)).toEqual([
      'aktuell',
      'mittel',
      'alt',
    ]);
  });
});

describe('normalizeLines', () => {
  it('liefert undefined für leeren Text', () => {
    expect(normalizeLines(' \n • \n')).toBeUndefined();
  });
});

describe('parseProfileDraft', () => {
  it('wandelt die KI-Antwort in ein Profil und verwirft Unbrauchbares', () => {
    expect(
      parseProfileDraft({
        firstName: 'Marco',
        lastName: 'Hinkelmann',
        headline: 'Senior Fullstack-Entwickler',
        street: null,
        postalCode: '85276',
        city: 'Pfaffenhofen a. d. Ilm',
        phone: null,
        email: null,
        birthDate: '1976-01-11',
        birthPlace: 'Magdeburg',
        summary: '  ',
        experience: [
          {
            title: 'Senior Fullstack-Entwickler',
            organization: 'Region10Group GmbH',
            location: 'Ingolstadt',
            description: '• React\n• Node.js',
            startDate: '2023-05',
            endDate: '2026-10',
            isCurrent: false,
          },
          {
            title: null,
            organization: 'ohne Titel',
            startDate: null,
            endDate: null,
            isCurrent: null,
          },
        ],
        education: [
          {
            title: 'Bachelor Kulturwissenschaften',
            organization: 'FernUniversität in Hagen',
            location: null,
            description: null,
            startDate: '2025-10',
            endDate: '2027',
            isCurrent: true,
          },
          { title: 'Fachhochschulreife', startDate: '05/1995', endDate: '1996', isCurrent: false },
        ],
        skills: [
          { category: 'Frontend', items: 'React, TypeScript' },
          { category: 'Leer', items: '' },
        ],
        languages: [
          { language: 'Englisch', level: 'verhandlungssicher' },
          { language: null, level: 'B2' },
        ],
      }),
    ).toEqual({
      firstName: 'Marco',
      lastName: 'Hinkelmann',
      headline: 'Senior Fullstack-Entwickler',
      postalCode: '85276',
      city: 'Pfaffenhofen a. d. Ilm',
      birthDate: '1976-01-11',
      birthPlace: 'Magdeburg',
      experience: [
        {
          title: 'Senior Fullstack-Entwickler',
          organization: 'Region10Group GmbH',
          location: 'Ingolstadt',
          description: 'React\nNode.js',
          startDate: '2023-05',
          endDate: '2026-10',
          isCurrent: false,
        },
      ],
      education: [
        {
          title: 'Bachelor Kulturwissenschaften',
          organization: 'FernUniversität in Hagen',
          startDate: '2025-10',
          isCurrent: true,
        },
        { title: 'Fachhochschulreife', endDate: '1996', isCurrent: false },
      ],
      skills: [{ category: 'Frontend', items: 'React, TypeScript' }],
      languages: [{ language: 'Englisch', level: 'verhandlungssicher' }],
    });
  });

  it('wirft bei einer Antwort, die gar nicht passt', () => {
    expect(() => parseProfileDraft({ experience: 'viel' })).toThrow();
  });

  it('fasst den Entwurf zusammen', () => {
    expect(
      summarizeProfileInput({
        firstName: '',
        lastName: '',
        experience: [{ title: 'A', isCurrent: false }],
        education: [],
        skills: [],
        languages: [{ language: 'Deutsch' }, { language: 'Englisch' }],
      }),
    ).toBe('1 berufliche Station, 0 Aus-/Weiterbildungen, 0 Kenntnisgruppen, 2 Sprachen');
  });
});

describe('profileToInput', () => {
  it('entfernt ids, Art und onboardedAt', () => {
    const profile: Profile = {
      firstName: 'Erika',
      lastName: 'Muster',
      onboardedAt: '2026-11-20T08:00:00.000Z',
      experience: [{ id: 'e1', kind: 'experience', title: 'A', isCurrent: false }],
      education: [],
      skills: [{ id: 's1', items: 'React' }],
      languages: [{ id: 'l1', language: 'Deutsch' }],
    };
    expect(profileToInput(profile)).toEqual({
      firstName: 'Erika',
      lastName: 'Muster',
      experience: [{ title: 'A', isCurrent: false }],
      education: [],
      skills: [{ items: 'React' }],
      languages: [{ language: 'Deutsch' }],
    });
  });
});

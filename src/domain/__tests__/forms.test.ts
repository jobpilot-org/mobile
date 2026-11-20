import {
  applicationToForm,
  emptyApplicationForm,
  emptyContactForm,
  emptyRegistrationForm,
  parseApplicationForm,
  parseAppointmentForm,
  parseContactForm,
  parseRegistrationForm,
  type ApplicationFormValues,
} from '@/domain/forms';

const valid: ApplicationFormValues = {
  ...emptyApplicationForm('2026-10-10'),
  company: '  Nordlicht Software ',
  role: 'Senior Fullstack Developer',
};

describe('parseApplicationForm', () => {
  it('übernimmt Pflichtfelder getrimmt und lässt leere optionale Felder weg', () => {
    expect(parseApplicationForm(valid)).toEqual({
      ok: true,
      value: {
        company: 'Nordlicht Software',
        role: 'Senior Fullstack Developer',
        location: '',
        appliedAt: '2026-10-10',
        status: 'applied',
        priority: 'normal',
      },
    });
  });

  it('meldet fehlende Pflichtfelder einzeln', () => {
    const result = parseApplicationForm({ ...valid, company: ' ', role: '' });
    expect(result).toEqual({
      ok: false,
      errors: {
        company: 'Bitte das Unternehmen angeben',
        role: 'Bitte die Position angeben',
      },
    });
  });

  it('versteht Gehälter mit Tausenderpunkt und Euro-Zeichen', () => {
    const result = parseApplicationForm({ ...valid, salaryMin: '75.000', salaryMax: '85 000 €' });
    expect(result.ok && [result.value.salaryMin, result.value.salaryMax]).toEqual([75000, 85000]);
  });

  it('lehnt „bis“ kleiner als „von“ ab', () => {
    const result = parseApplicationForm({ ...valid, salaryMin: '90000', salaryMax: '80000' });
    expect(result).toMatchObject({ ok: false, errors: { salaryMax: expect.any(String) } });
  });

  it('lehnt Text im Gehaltsfeld ab', () => {
    const result = parseApplicationForm({ ...valid, salaryMin: 'viel' });
    expect(result).toMatchObject({
      ok: false,
      errors: { salaryMin: 'Bitte nur ganze Euro-Beträge' },
    });
  });

  it('ergänzt https:// bei Links ohne Protokoll', () => {
    const result = parseApplicationForm({ ...valid, jobUrl: 'firma.de/jobs/42' });
    expect(result.ok && result.value.jobUrl).toBe('https://firma.de/jobs/42');
  });

  it('lehnt ungültige Links ab', () => {
    const result = parseApplicationForm({ ...valid, jobUrl: 'kein link' });
    expect(result).toMatchObject({ ok: false, errors: { jobUrl: expect.any(String) } });
  });

  it('übernimmt Arbeitsmodell und Quelle', () => {
    const result = parseApplicationForm({ ...valid, workMode: 'remote', source: ' LinkedIn ' });
    expect(result.ok && [result.value.workMode, result.value.source]).toEqual([
      'remote',
      'LinkedIn',
    ]);
  });

  it('ergibt aus einer gespeicherten Bewerbung wieder dieselben Werte', () => {
    const application = {
      id: 'a1',
      company: 'Lumen Works',
      role: 'Senior Node.js Engineer',
      location: 'München',
      workMode: 'hybrid' as const,
      appliedAt: '2026-09-10',
      status: 'offer' as const,
      priority: 'high' as const,
      source: 'Recruiter',
      jobUrl: 'https://lumen.example/jobs',
      salaryMin: 78000,
      salaryMax: 85000,
      nextStep: 'Angebot beantworten',
    };
    const { id: _, ...input } = application;
    expect(parseApplicationForm(applicationToForm(application))).toEqual({
      ok: true,
      value: input,
    });
  });
});

describe('parseContactForm', () => {
  it('verlangt einen Namen und prüft die E-Mail-Adresse', () => {
    expect(parseContactForm({ ...emptyContactForm(), email: 'jana@' })).toEqual({
      ok: false,
      errors: {
        name: 'Bitte einen Namen angeben',
        email: 'Bitte eine gültige E-Mail-Adresse eingeben',
      },
    });
  });

  it('ergänzt https:// beim LinkedIn-Profil', () => {
    const result = parseContactForm({
      ...emptyContactForm(),
      name: 'Jana Peters',
      linkedinUrl: 'linkedin.com/in/jana',
    });
    expect(result).toEqual({
      ok: true,
      value: { name: 'Jana Peters', linkedinUrl: 'https://linkedin.com/in/jana' },
    });
  });
});

describe('parseAppointmentForm', () => {
  it('wandelt den Zeitpunkt in ISO-8601 um', () => {
    const startsAt = new Date('2026-10-12T08:00:00.000Z');
    expect(parseAppointmentForm({ kind: 'video', startsAt, location: ' ', notes: '' })).toEqual({
      ok: true,
      value: { kind: 'video', startsAt: '2026-10-12T08:00:00.000Z' },
    });
  });
});

describe('parseRegistrationForm', () => {
  const registration = {
    ...emptyRegistrationForm(),
    firstName: ' Erika ',
    lastName: 'Muster',
    email: ' Erika@Example.DE ',
    password: 'geheim123',
    passwordRepeat: 'geheim123',
  };

  it('liefert getrimmte Namen, die E-Mail in Kleinbuchstaben und das Passwort ohne Wiederholung', () => {
    expect(parseRegistrationForm(registration)).toEqual({
      ok: true,
      value: {
        firstName: 'Erika',
        lastName: 'Muster',
        email: 'erika@example.de',
        password: 'geheim123',
      },
    });
  });

  it('meldet fehlende Pflichtfelder pro Feld', () => {
    expect(parseRegistrationForm(emptyRegistrationForm())).toEqual({
      ok: false,
      errors: {
        firstName: 'Bitte den Vornamen eingeben',
        lastName: 'Bitte den Nachnamen eingeben',
        email: 'Bitte eine gültige E-Mail-Adresse eingeben',
        password: 'Das Passwort braucht mindestens 8 Zeichen',
      },
    });
  });

  it('meldet abweichende Passwort-Wiederholung auch neben anderen Fehlern', () => {
    expect(
      parseRegistrationForm({ ...registration, firstName: '', passwordRepeat: 'geheim124' }),
    ).toEqual({
      ok: false,
      errors: {
        firstName: 'Bitte den Vornamen eingeben',
        passwordRepeat: 'Die Passwörter stimmen nicht überein',
      },
    });
  });

  it('lehnt zu kurze Passwörter ab', () => {
    expect(
      parseRegistrationForm({ ...registration, password: 'kurz', passwordRepeat: 'kurz' }),
    ).toEqual({ ok: false, errors: { password: 'Das Passwort braucht mindestens 8 Zeichen' } });
  });
});

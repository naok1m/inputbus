import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useBindingStore } from '../store/mappingStore';

export function ProfileSelector() {
  const { activeProfile, savedProfiles, saveProfile, loadProfile, refreshProfiles, resetFpsDefaults } = useBindingStore();
  const [profileName, setProfileName] = useState(activeProfile || 'default');
  const [selectedProfile, setSelectedProfile] = useState(activeProfile || 'default');

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    setSelectedProfile(activeProfile);
  }, [activeProfile]);

  const hasProfiles = savedProfiles.length > 0;
  const options = useMemo(() => savedProfiles, [savedProfiles]);

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const name = profileName.trim();
    if (!name) return;
    saveProfile(name);
    setSelectedProfile(name);
    refreshProfiles();
  };

  const onLoad = () => {
    if (!selectedProfile) return;
    loadProfile(selectedProfile);
  };

  return (
    <section className="profile-selector card">
      <h2>Profiles</h2>
      <form className="profile-form" onSubmit={onSave}>
        <input
          value={profileName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setProfileName(e.target.value)}
          placeholder="Profile name"
          aria-label="Profile name"
        />
        <button type="submit">Save Profile</button>
      </form>

      <div className="profile-load-row">
        <select
          value={selectedProfile}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedProfile(e.target.value)}
          disabled={!hasProfiles}
          aria-label="Saved profiles"
        >
          {!hasProfiles && <option value="">No saved profiles</option>}
          {options.map((name: string) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button type="button" onClick={onLoad} disabled={!hasProfiles || !selectedProfile}>
          Load Profile
        </button>
        <button type="button" onClick={resetFpsDefaults}>
          Reset FPS Default
        </button>
      </div>
    </section>
  );
}

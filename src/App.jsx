import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    roleId: "",
    organizerCode: "",
    accepted: false,
  });

  const [roles, setRoles] = useState([]);
  const [rolesError, setRolesError] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not get CSRF token");
        return response.json();
      })
      .then((data) => setCsrfToken(data.token))
      .catch((error) => {
        console.error(error);
        setServerError("Nie można połączyć się z serwerem.");
      });
  }, []);

  // Pobieranie ról z backendu
  useEffect(() => {
    async function loadRoles() {
      try {
        const response = await fetch("/api/roles");

        if (!response.ok) {
          throw new Error("Błąd pobierania ról");
        }

        const data = await response.json();

        setRoles(data.filter((role) => role.name !== "ADMIN"));
        setRolesError("");
      } catch (error) {
        console.error(error);
        setRolesError("Nie udało się pobrać ról z serwera.");
      }
    }

    loadRoles();
  }, []);

  const selectedRole = roles.find((role) => String(role.id) === form.roleId);

  // Obsługa zmian w formularzu
  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));

    setErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    setServerError("");
    setSuccess(false);
  }

  // Walidacja danych
  function validate() {
    const newErrors = {};

    if (!form.firstName.trim()) {
      newErrors.firstName = "Podaj imię.";
    } else if (form.firstName.length > 100) {
      newErrors.firstName = "Maksymalnie 100 znaków.";
    }

    if (!form.lastName.trim()) {
      newErrors.lastName = "Podaj nazwisko.";
    } else if (form.lastName.length > 100) {
      newErrors.lastName = "Maksymalnie 100 znaków.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Podaj poprawny adres e-mail.";
    }

    if (form.password.length < 8 || form.password.length > 64) {
      newErrors.password = "Hasło musi mieć od 8 do 64 znaków.";
    }

    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = "Hasła muszą być identyczne.";
    }

    if (!selectedRole) {
      newErrors.roleId = "Wybierz rolę użytkownika.";
    }

    if (
      selectedRole?.name === "ORGANISER" &&
      !/^[A-Za-z0-9]{6}$/.test(form.organizerCode)
    ) {
      newErrors.organizerCode = "Kod musi zawierać dokładnie 6 liter lub cyfr.";
    }

    if (!form.accepted) {
      newErrors.accepted = "Musisz zaakceptować regulamin.";
    }

    return newErrors;
  }

  // Obsługa błędów z backendu
  function handleApiErrors(data, status) {
    const fieldErrors = {};

    const knownFields = [
      "firstName",
      "lastName",
      "email",
      "password",
      "confirmPassword",
      "role",
      "roleId",
      "organiserCode",
      "organizerCode",
    ];

    function normalizeField(field) {
      if (field === "organiserCode") return "organizerCode";
      if (field === "role") return "roleId";
      return field;
    }

    const source = data?.errors ?? data?.fieldErrors;

    // Błędy zwrócone jako obiekt
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source)) {
        if (!knownFields.includes(key)) continue;

        fieldErrors[normalizeField(key)] =
          typeof value === "string"
            ? value
            : Array.isArray(value)
              ? value.join(", ")
              : (value?.message ?? "Nieprawidłowa wartość.");
      }
    }

    // Błędy zwrócone jako tablica
    if (Array.isArray(source)) {
      for (const item of source) {
        const key = item?.field ?? item?.property;

        if (!knownFields.includes(key)) continue;

        fieldErrors[normalizeField(key)] =
          item.message ?? item.defaultMessage ?? "Nieprawidłowa wartość.";
      }
    }

    const message = String(data?.message ?? data?.detail ?? "");

    // Zajęty adres e-mail
    if (
      /idx_users_email|duplicate key|already exists/i.test(message) &&
      /email/i.test(message)
    ) {
      fieldErrors.email = "Ten adres e-mail jest już zarejestrowany.";
    }

    // Nieprawidłowy kod organizatora
    if (
      selectedRole?.name === "ORGANISER" &&
      (/the provided code was not found|organiser code|organizer code/i.test(
        message,
      ) ||
        (status === 400 && Number(data?.status) === 403))
    ) {
      fieldErrors.organizerCode =
        "Nieprawidłowy lub wykorzystany kod Organizatora.";
    }

    // Ukrywanie technicznych komunikatów SQL
    for (const key of Object.keys(fieldErrors)) {
      const value = String(fieldErrors[key]);

      if (/SQL|constraint|duplicate key|insert into|stacktrace/i.test(value)) {
        fieldErrors[key] = "Nieprawidłowa wartość.";
      }
    }

    setErrors((previous) => ({
      ...previous,
      ...fieldErrors,
    }));

    if (Object.keys(fieldErrors).length > 0) {
      setServerError("");
    } else if (status >= 500) {
      setServerError("Wystąpił błąd serwera. Spróbuj ponownie później.");
    } else {
      setServerError("Nie udało się utworzyć konta. Sprawdź dane formularza.");
    }
  }

  // Wysyłanie formularza do backendu
  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    const newErrors = validate();

    setErrors(newErrors);
    setServerError("");
    setSuccess(false);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    const requestBody = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: {
        id: selectedRole.id,
        name: selectedRole.name,
      },
      organiserCode:
        selectedRole.name === "ORGANISER" ? form.organizerCode : null,
    };

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": csrfToken,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        setSuccess(true);

        setForm((previous) => ({
          ...previous,
          password: "",
          confirmPassword: "",
          organizerCode: "",
        }));
      } else {
        const data = await response.json().catch(() => ({}));

        handleApiErrors(data, response.status);
      }
    } catch (error) {
      console.error(error);

      setServerError("Nie można połączyć się z serwerem.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="left-panel">
        <header className="logo">
          <span className="logo-symbol">●</span>

          <div>
            <strong>KOALA</strong>
            <small>Konkurs Matematyczno-Informatyczny</small>
          </div>
        </header>

        <main className="form-container">
          <a href="#" className="back-link">
            ← Wróć do logowania
          </a>

          <p className="eyebrow">NOWE KONTO</p>

          <h1>Rejestracja konta</h1>

          <p className="subtitle">
            Podaj swoje dane, aby utworzyć konto w systemie KOALA.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="firstName">Imię</label>

                <input
                  id="firstName"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                />

                {errors.firstName && (
                  <span className="error">{errors.firstName}</span>
                )}
              </div>

              <div className="field">
                <label htmlFor="lastName">Nazwisko</label>

                <input
                  id="lastName"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                />

                {errors.lastName && (
                  <span className="error">{errors.lastName}</span>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Adres e-mail</label>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="twoj@email.pl"
                value={form.email}
                onChange={handleChange}
              />

              {errors.email && (
                <span className="error" role="alert">
                  {errors.email}
                </span>
              )}
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="password">Hasło</label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                />

                {errors.password && (
                  <span className="error">{errors.password}</span>
                )}
              </div>

              <div className="field">
                <label htmlFor="confirmPassword">Potwierdź hasło</label>

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                />

                {errors.confirmPassword && (
                  <span className="error">{errors.confirmPassword}</span>
                )}
              </div>
            </div>

            <p className="hint">Hasło powinno zawierać od 8 do 64 znaków.</p>

            <div className="field">
              <label htmlFor="roleId">Rola użytkownika</label>

              <select
                id="roleId"
                name="roleId"
                value={form.roleId}
                onChange={handleChange}
                style={{
                  width: "100%",
                  height: "49px",
                  padding: "0 14px",
                  border: "1px solid #cfddd8",
                  borderRadius: "8px",
                  background: "white",
                }}
              >
                <option value="">Wybierz rolę</option>

                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name === "USER"
                      ? "Użytkownik"
                      : role.name === "ORGANISER"
                        ? "Organizator"
                        : role.name === "GUARDIAN"
                          ? "Opiekun"
                          : role.name}
                  </option>
                ))}
              </select>

              {rolesError && <span className="error">{rolesError}</span>}

              {errors.roleId && <span className="error">{errors.roleId}</span>}
            </div>

            {selectedRole?.name === "ORGANISER" && (
              <div className="field">
                <label htmlFor="organizerCode">Kod Organizatora</label>

                <input
                  id="organizerCode"
                  name="organizerCode"
                  placeholder="Np. AB12CD"
                  value={form.organizerCode}
                  onChange={handleChange}
                />

                {errors.organizerCode && (
                  <span className="error" role="alert">
                    {errors.organizerCode}
                  </span>
                )}
              </div>
            )}

            <label className="checkbox-label">
              <input
                type="checkbox"
                name="accepted"
                checked={form.accepted}
                onChange={handleChange}
              />

              <span>Akceptuję regulamin konkursu i politykę prywatności.</span>
            </label>

            {errors.accepted && (
              <span className="error">{errors.accepted}</span>
            )}

            <button
              type="submit"
              className="submit-button"
              disabled={loading || roles.length === 0}
            >
              {loading ? "Trwa rejestracja..." : "Utwórz konto →"}
            </button>

            {serverError && (
              <p className="error" role="alert">
                {serverError}
              </p>
            )}

            {success && (
              <p
                className="success"
                role="status"
                style={{
                  marginTop: "18px",
                  padding: "14px",
                  background: "#e5f7ed",
                  border: "1px solid #7aca9e",
                  borderRadius: "8px",
                  color: "#006b43",
                  fontWeight: "bold",
                  textAlign: "center",
                }}
              >
                Konto zostało pomyślnie utworzone!
              </p>
            )}
          </form>

          <p className="login-footer">
            Masz już konto? <a href="#">Zaloguj się</a>
          </p>
        </main>
      </div>

      <aside className="right-panel">
        <div className="decor">∑</div>

        <div className="right-content">
          <h2>
            Połącz logikę
            <br />z kreatywnością.
          </h2>

          <p>
            Załóż konto i przygotuj się do wyzwań na styku matematyki i
            informatyki.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default App;

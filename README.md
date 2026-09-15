# Site Bonitinho

Guia de implantação no [PythonAnywhere](https://www.pythonanywhere.com/).

---

## 1. Crie sua conta

Acesse [https://www.pythonanywhere.com/registration/register/beginner/](https://www.pythonanywhere.com/registration/register/beginner/) e crie uma conta.

## 2. Crie o web app

1. Na página inicial, vá até **Web**.
2. Clique em **Add a new web app**.
3. Clique em **Next**.
4. Escolha **Flask**.
5. Escolha **Python 3.13**.

### Ajuste o caminho do app

Na configuração do web app, mude o campo **path** (Code/working directory):
- De: `mysite/flask_app.py`
- Para: `<nome-do-seu-repositorio>/app.py`

> Exemplo: `site-bonitinho-mobile/app.py`

Seu app está pronto. Você pode verificar clicando no link que vem **Configuration for**.

## 3. Substitua o projeto pelo clone do GitHub

1. Vá até **Files** e **apague a pasta** do app que acabou de criar (`mysite`).
2. Clique em **Open Bash here** (no diretório raiz).
3. Clone o repositório:

```bash
git clone https://github.com/py-rafasx/site-bonitinho-mobile.git
```

4. Entre na pasta do repositório:

```bash
cd site-bonitinho-mobile
```

## 4. Configure o `.env`

```bash
touch .env
python -c "import secrets; print(secrets.token_hex(32))" > .env
```


## 5. Instale as dependências

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 6. Recarregue e acesse

1. Vá novamente em **Web**.
2. Clique em **Reload** no seu web app.
3. Acesse o link do seu site.

---

> ⚠️ **Atenção:** o **primeiro usuário** a se registrar recebe automaticamente os privilégios de **admin**. Certifique-se de que esse primeiro cadastro seja o seu.

---

## 7. Push Notifications (Firebase)

As notificações push são opcionais. Para ativar:

### 7.1 Crie um projeto no Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Clique em **Criar projeto** (ou adicione a um existente).
3. Dê um nome ao projeto (ex: `sitebonitinho-push`).

### 7.2 Cadastre um app Web

1. No Firebase Console, vá em **Configurações do projeto** (engrenagem) → **Geral**.
2. Em **Seus apps**, clique em **</>** (Web).
3. Dê um nome e clique em **Registrar**.
4. Copie o objeto `firebaseConfig` que aparece — ele contém `apiKey`, `authDomain`, `projectId`, etc.

### 7.3 Atualize as credenciais no código

Substitua os valores nos seguintes arquivos:

- `firebase-messaging-sw.js` → objeto `firebase.initializeApp({...})`
- `static/js/firebase-config.js` → objeto `firebaseConfig`

### 7.4 Baixe a Service Account Key

1. No Firebase Console, vá em **Configurações do projeto** → aba **Service accounts**.
2. Clique em **Generate new private key** (botão azul).
3. Salve o JSON baixado como `firebase-service-account.json` na **raiz do projeto**.

> ⚠️ Este arquivo contém a chave privada e **não deve ser versionado**. Já está no `.gitignore`.

### 7.5 Reinstale as dependências

```bash
pip install -r requirements.txt
```

### 7.6 Recarregue o app

```bash
# PythonAnywhere: clique em Reload
# Local: reinicie o servidor
```

As notificações estarão disponíveis pelo ícone de sino no header. Clique para ativar/desativar.


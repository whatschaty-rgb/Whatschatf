# 💬 WhatsChat - Sistema de Mensagens Instantâneas Realtime

Uma aplicação web completa de chat em tempo real inspirada no WhatsApp Web/Mobile, desenvolvida com **JavaScript Vanilla (ES6+ Modules)**, **HTML5**, **CSS3 Vanilla (Mobile-First / Design Tokens)** e **Supabase** (Auth, PostgreSQL DB, Realtime e Storage).

---

## 🚀 Funcionalidades do Sistema

### 1. 🔑 Autenticação & Gestão de Contas
- **Cadastro e Login com Supabase Auth**: Registro e autenticação segura com e-mail e senha.
- **Fluxo de Aprovação de Novos Usuários (`is_approved`)**:
  - Novos cadastros são iniciados com status **Pendente** (`is_approved = FALSE`).
  - Bloqueio de acesso ao chat para usuários pendentes com mensagem informativa.
  - Administradores aprovam ou recusam novos cadastros no Painel Administrativo.
- **Perfil do Usuário**:
  - Upload de foto de perfil salva no Supabase Storage (`chat-media`).
  - Edição de nome de exibição e mensagem de recado (bio).
  - Indicador de status de presença online/offline em tempo real.

### 2. 💬 Sistema de Conversas & Grupos (CRUD)
- **Conversas Individuais (1:1)**:
  - Pesquisa dinâmica de usuários por nome ou e-mail.
  - Criação instantânea de sala privada com isolamento estrito de sessão por RLS (Row Level Security).
  - Exclusão de conversas privadas.
- **Grupos**:
  - Criar novos grupos com nome, avatar personalizado e múltiplos participantes.
  - Editar grupos existentes (alterar nome, foto e gerenciar participantes).
  - Excluir grupo com confirmação de segurança.
- **Lista de Conversas**:
  - Exibição de conversas ativas com avatar, nome, última mensagem, horário e contador de mensagens não lidas.
  - Cache local (`localStorage`) para carregamento instantâneo ao recarregar ou abrir a aplicação.

### 3. ✉️ Mensagens em Tempo Real (CRUD & Mídias)
- **Envio e Recebimento Realtime**: Atualização instantânea de mensagens sem necessidade de recarregar a página.
- **Edição e Exclusão de Mensagens**:
  - **Editar Mensagem**: Altera o conteúdo da mensagem enviada (exibe indicador `(editado)`).
  - **Excluir Mensagem**: Remove a mensagem do chat para todos os participantes em tempo real.
- **Envio de Mídias**:
  - **Fotos**: Upload de imagens do dispositivo ou captura direta via **Câmera** (Webcam / Câmeras frontal e traseira em dispositivos móveis). Visualizador em tela cheia (*Lightbox*) ao clicar na foto.
  - **Áudios de Voz**: Gravador de áudio em tempo real (Web Audio API) com timer `0:00`, animação de ondas sonoras, pré-escuta e player de áudio personalizado com barra de progresso.
- **Emojis**: Seletor rápido de emojis integrado ao campo de mensagem.
- **Rascunhos de Mensagem**: Salvamento automático de rascunho por conversa enquanto digita.
- **Recibos de Leitura**: Indicadores visuais de envio (1 check) e leitura (double check azul).

### 4. 👑 Painel Administrativo (`Admin Dashboard`)
- **Restrição de Acesso por Cargo (RBAC)**: Visível exclusivamente para usuários com cargo de administrador (`role = 'admin'`).
- **Abas do Painel Admin**:
  - **👥 Usuários (Aprovação & CRUD)**:
    - Lista completa de usuários cadastrados com avatar, nome, e-mail, cargo e status de aprovação.
    - Filtros por status: **Todos**, **Pendentes** (com contagem visual) e **Aprovados**.
    - **Aprovar (✓)**: Aprova cadastros pendentes instantaneamente.
    - **Editar (✏️)**: Altera Nome, Recado, Cargo (`user` / `admin`) e Status de Aprovação.
    - **Excluir (🗑️)**: Exclui contas de usuário.
  - **⚙️ Configuração**:
    - Alterar Nome do Sistema.
    - Limite de Upload por Mídia (MB).
    - Habilitar/Desabilitar formulário de registro.
    - Ativar Modo de Manutenção e Mensagem Global de Aviso (Broadcast).
  - **🔒 Permissões**:
    - Matriz de controle de acesso para habilitar/desabilitar permissões de usuários comuns (criar grupos, enviar fotos/áudios, editar/excluir mensagens).

### 5. 📱 Design Responsivo Mobile-First
- **Layout de Tela Cheia Real (`100dvh`)**: Suporte a Insets de Área Segura (`env(safe-area-inset-top)` / `bottom`) para iPhones e dispositivos Android com entalhe/câmera.
- **Navegação Mobile**: Alternância fluida entre lista de conversas e janela de chat com animações de deslize (*slide*) e suporte ao botão voltar do celular (`pushState` / `popstate`).
- **Modais em Bottom Sheet**: Em telas pequenas (`< 640px`), modais funcionam como painéis deslizantes inferiores com alça de toque.
- **Acessibilidade ao Toque**: Botões com área de toque mínima de `44px x 44px`, fontes de `16px` para prevenir zoom automático no iOS Safari, e rolagem horizontal em abas e filtros.

---

## 🛠️ Tecnologias Utilizadas

| Camada | Tecnologia |
| :--- | :--- |
| **Interface (UI)** | HTML5 Semântico, CSS3 Vanilla (Custom Properties, Flexbox, Grid) |
| **Lógica (Client)** | JavaScript Vanilla (ES6+ Modules, Async/Await) |
| **Backend / DB** | Supabase (PostgreSQL, Supabase Auth, Realtime, Storage) |
| **APIs do Navegador** | Web Audio API (`MediaRecorder`), WebRTC (`getUserMedia`), History API, Visual Viewport API |

---

## 🗄️ Estrutura do Banco de Dados (Supabase)

O arquivo [`schema.sql`](file:///c:/Users/freds/OneDrive/Desktop/Whatschat/schema.sql) contém a estrutura completa das tabelas e políticas de segurança RLS:

- `profiles`: Armazena dados de exibição (`full_name`, `avatar_url`, `status_msg`), cargo (`role`) e aprovação (`is_approved`).
- `conversations`: Salas de chat individuais e grupos (`is_group`, `name`, `avatar_url`).
- `conversation_participants`: Relacionamento entre usuários e conversas.
- `messages`: Mensagens enviadas (`content`, `media_type`, `media_url`, `is_edited`).
- `system_settings`: Configurações globais e matriz de permissões.

---

## 🔧 Como Executar o Projeto Localmente

1. **Clonar o Repositório**:
   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd Whatschat
   ```

2. **Configurar o Banco de Dados no Supabase**:
   - Abra o SQL Editor no painel do Supabase.
   - Execute o script [`schema.sql`](file:///c:/Users/freds/OneDrive/Desktop/Whatschat/schema.sql).

3. **Configurar as Chaves no Client**:
   - No arquivo [`supabaseClient.js`](file:///c:/Users/freds/OneDrive/Desktop/Whatschat/supabaseClient.js), insira o `SUPABASE_URL` e `SUPABASE_ANON_KEY` do seu projeto Supabase.

4. **Iniciar o Servidor Local**:
   ```bash
   python -m http.server 8080
   ```
   Acesse no navegador em `http://localhost:8080`.

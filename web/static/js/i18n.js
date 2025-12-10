/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NetConfig Lab Image Manager is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.
 */

(function () {
  const STORAGE_KEY = 'netconfig-language';

  const translations = {
    pt: {
      'ui.projectTitle': 'NetConfig Lab Image Manager',
      'ui.language.label': 'Idioma',
      'ui.language.auto': 'Automático',
      'ui.language.pt': 'Português',
      'ui.language.en': 'Inglês',
      'ui.language.es': 'Espanhol',
      'ui.tabs.images': 'Imagens',
      'ui.tabs.templates': 'Templates',
      'ui.tabs.icons': 'Ícones',
      'ui.tabs.ishare2': 'iShare2',
      'ui.eveIpLabel': 'IP do EVE-NG/PNETLab',
      'ui.eveIpPlaceholder': 'Ex: 10.0.0.10',
      'ui.eveUserLabel': 'Usuário SSH',
      'ui.eveUserPlaceholder': 'Ex: root',
      'ui.evePassLabel': 'Senha SSH',
      'ui.evePassPlaceholder': 'Senha do usuário no EVE',
      'ui.loadDataTitle': 'Carregar dados do EVE / PNETLab',
      'ui.loadDataHint': 'Informe IP, usuário e senha e clique para carregar imagens, ícones e templates existentes.',
      'ui.loadDataBtn': 'Carregar dados',
      'ui.loadDataBtnLoading': 'Carregando...',
      'ui.images.typeLabel': 'Tipo de imagem (Destino)',
      'ui.images.typeHint': 'Isso só preenche o diretório base automaticamente. Você ainda pode editar abaixo.',
      'ui.images.baseDirLabel': 'Diretório base no EVE',
      'ui.images.baseDirHint': 'QEMU: <code>/opt/unetlab/addons/qemu</code> · IOL: <code>/opt/unetlab/addons/iol/bin</code> · Dynamips: <code>/opt/unetlab/addons/dynamips</code>.',
      'ui.images.templateLabel': 'Nome do Template (diretório)',
      'ui.images.templatePlaceholder': 'Ex: mikrotik-6.38.4',
      'ui.images.filesLabel': 'Imagens (pode selecionar várias)',
      'ui.images.filesHint': 'Use nomes como <code>hda.qcow2</code>, <code>hdb.qcow2</code>, <code>virtioa.qcow2</code>, etc.',
      'ui.images.progressShort': 'Enviando...',
      'ui.images.footerInfo': 'Selecione os arquivos e clique em enviar para publicar no seu EVE-NG.',
      'ui.images.checkBtn': 'Checar imagens existentes',
      'ui.images.uploadBtn': 'Enviar imagens',
      'ui.images.fixBtn': 'Fix Permissions',
      'ui.templates.existingLabel': 'Templates existentes no EVE',
      'ui.templates.searchPlaceholder': 'Filtrar por nome (ex: huawei, juniper, mikrotik...)',
      'ui.templates.listBtn': 'Listar templates',
      'ui.templates.listHint': 'Clique em um template da lista para carregar o conteúdo no editor abaixo.',
      'ui.templates.fileLabel': 'Nome do arquivo de template',
      'ui.templates.filePlaceholder': 'Ex: huaweine40.yml',
      'ui.templates.fileHint': 'Se não informar a extensão, será usado <code>.yml</code> automaticamente.',
      'ui.templates.contentLabel': 'Conteúdo do template YAML',
      'ui.templates.contentPlaceholder': '# Cole ou edite aqui o conteúdo YAML do template...',
      'ui.templates.contentHint': 'O arquivo será enviado para: <code>/opt/unetlab/html/templates/amd</code> e <code>/opt/unetlab/html/templates/intel</code>.',
      'ui.templates.loadBtn': 'Carregar template do EVE',
      'ui.templates.saveBtn': 'Salvar template no EVE',
      'ui.icons.existingLabel': 'Ícones existentes no EVE',
      'ui.icons.listBtn': 'Listar ícones',
      'ui.icons.hint': 'Lista de arquivos de ícones disponíveis no EVE-NG (ex: <code>/opt/unetlab/html/images/icons</code>).',
      'ui.icons.uploadLabel': 'Enviar novo ícone (PNG)',
      'ui.icons.uploadHint': 'O arquivo será enviado para o diretório de ícones do EVE-NG. Recomenda-se PNG com dimensões apropriadas (ex: 64x64).',
      'ui.icons.uploadBtn': 'Enviar ícone',
      'ui.ishare2.searchLabel': 'Busca no iShare2 (search all)',
      'ui.ishare2.searchBtn': 'Buscar no iShare2',
      'ui.ishare2.searchHint': 'Esta busca usa o comando <code>ishare2 search all</code> para listar imagens disponíveis nos mirrors do projeto iShare2.',
      'ui.ishare2.resultLabel': 'Resultado',
      'ui.ishare2.filterPlaceholder': 'Filtrar pelos nomes das imagens (ex: mikrotik, juniper...)',
      'ui.ishare2.progressLabel': 'Instalando...',
      'msg.parseError': 'Erro ao interpretar resposta do servidor.',
      'msg.networkError': 'Falha na comunicação com o servidor.',
      'upload.progress': 'Enviando arquivos... {percent}% ({loaded} MB de {total} MB)',
      'upload.progress.indeterminate': 'Enviando arquivos...',
      'upload.processing': 'Processando no servidor...',
      'upload.success': 'Upload concluído com sucesso.',
      'upload.error': 'Erro ao processar upload.',
      'labels.context': 'Contexto:',
      'load.missingCreds': 'Preencha IP, usuário e senha do EVE/PNETLab antes de carregar os dados.',
      'load.success': 'Dados carregados: imagens, ícones e templates atualizados.',
      'load.partial': 'Algumas seções não carregaram ({success}/{total}). Verifique as mensagens e tente novamente.',
      'load.failed': 'Falha ao carregar os dados. Tente novamente.',
      'platform.label': 'Detectado: {name}',
      'platform.eve': 'EVE-NG',
      'platform.pnetlab': 'PNETLab',
      'platform.unknown': 'Não identificado',
      'labels.target': 'Destino:',
      'labels.step': 'Etapa:',
      'images.missingCreds': 'Preencha IP do EVE, usuário e senha para listar as imagens.',
      'images.parseError': 'Erro ao interpretar resposta do servidor.',
      'images.emptyResponse': 'Resposta vazia da API.',
      'images.requestFail': 'Falha ao listar imagens.',
      'images.success': 'Imagens listadas com sucesso.',
      'images.title': 'Imagens existentes no EVE-NG',
      'images.updated': 'Atualizado agora',
      'images.templateCount': '{count} template|{count} templates',
      'images.none': 'Nenhum template encontrado.',
      'images.vendorCount': '{count} versão|{count} versões',
      'templates.missingCreds': 'Preencha IP, usuário e senha para listar templates.',
      'templates.parseError': 'Erro ao interpretar resposta da API de templates.',
      'templates.emptyResponse': 'Resposta vazia da API de templates.',
      'templates.requestFail': 'Falha ao listar templates.',
      'templates.successList': 'Templates listados com sucesso.',
      'templates.none': 'Nenhum template encontrado.',
      'templates.missingName': 'Informe o nome do arquivo do template (ex: huaweine40.yml).',
      'templates.loadFail': 'Falha ao buscar template.',
      'templates.loadSuccess': 'Template carregado.',
      'templates.saveMissingCreds': 'Preencha IP, usuário e senha para salvar o template.',
      'templates.saveMissingName': 'Informe o nome do arquivo do template.',
      'templates.saveMissingContent': 'Preencha o conteúdo YAML antes de salvar.',
      'templates.saveFail': 'Falha ao enviar template.',
      'templates.saveSuccess': 'Template enviado com sucesso.',
      'icons.missingCreds': 'Preencha IP, usuário e senha para listar ícones.',
      'icons.parseError': 'Erro ao interpretar resposta da API de ícones.',
      'icons.emptyResponse': 'Resposta vazia da API de ícones.',
      'icons.requestFail': 'Falha ao listar ícones.',
      'icons.successList': 'Ícones listados com sucesso.',
      'icons.none': 'Nenhum ícone encontrado.',
      'icons.uploadMissingCreds': 'Preencha IP, usuário e senha para enviar o ícone.',
      'icons.uploadSelectFile': 'Selecione um arquivo PNG para enviar.',
      'icons.uploadParseError': 'Erro ao interpretar resposta do upload de ícone.',
      'icons.uploadSuccess': 'Ícone enviado com sucesso.',
      'icons.uploadFail': 'Falha ao enviar ícone.',
      'fix.missingCreds': 'Preencha IP, usuário e senha para executar o fix permissions.',
      'fix.parseError': 'Erro ao interpretar resposta do fix permissions.',
      'fix.success': 'Fix permissions executado com sucesso.',
      'fix.fail': 'Falha ao executar fix permissions.',
      'fix.notFound': 'Endpoint de fix permissions não encontrado (verifique se /api/fixpermissions está exposto).',
      'ishare2.install.start': 'Iniciando instalação no EVE...',
      'ishare2.install.notFound': 'Job de instalação do iShare2 não foi encontrado.',
      'ishare2.install.pull': 'Baixando imagem via iShare2... {progress}%',
      'ishare2.install.copy': 'Enviando imagem para o EVE... {progress}%',
      'ishare2.install.fix': 'Aplicando fixpermissions no EVE... {progress}%',
      'ishare2.install.generic': 'Instalando no EVE... {progress}%',
      'ishare2.install.success': 'Imagem instalada com sucesso via iShare2.',
      'ishare2.install.fail': 'Falha ao instalar imagem via iShare2.',
      'ishare2.install.confirm': 'Deseja iniciar a instalação da imagem {namePart}({type} #{id})?',
      'ishare2.install.missingCreds': 'Preencha IP, usuário e senha do EVE-NG antes de instalar uma imagem pelo iShare2.',
      'ishare2.install.timeout': 'O servidor demorou muito para responder ao pedido de instalação (erro 504 - Gateway Timeout). A instalação de imagens grandes pode levar vários minutos. Verifique os logs do EVE/iShare2 para confirmar o estado da instalação e tente novamente se necessário.',
      'ishare2.install.noServer': 'Não foi possível contatar o servidor ao executar install no iShare2. Verifique sua conexão ou se o serviço está em execução.',
      'ishare2.install.parseError': 'Erro ao interpretar resposta do install do iShare2 (HTTP {status}). A resposta do servidor não está no formato esperado.',
      'ishare2.install.empty': 'Resposta vazia da API de install do iShare2.',
      'ishare2.install.failStart': 'Falha ao iniciar instalação via iShare2.',
      'ishare2.install.started': 'Instalação iniciada via iShare2. Acompanhe o progresso abaixo.',
      'ishare2.install.commFail': 'Falha na comunicação com o servidor ao executar install no iShare2.',
      'ishare2.search.timeout': 'O servidor demorou muito para responder à consulta do iShare2 (erro 504 - Gateway Timeout). Tente novamente em alguns instantes ou verifique os logs do backend.',
      'ishare2.search.noServer': 'Não foi possível contatar o servidor ao consultar o iShare2. Verifique sua conexão ou se o serviço está em execução.',
      'ishare2.search.parseError': 'Erro ao interpretar resposta da API do iShare2 (HTTP {status}). A resposta do servidor não está no formato esperado.',
      'ishare2.search.empty': 'Resposta vazia da API do iShare2.',
      'ishare2.search.fail': 'Falha ao executar ishare2 search all.',
      'ishare2.search.success': 'Busca no iShare2 concluída com sucesso.',
      'ishare2.search.noOutput': 'Nenhuma saída retornada pelo ishare2.',
      'ishare2.list.none': 'Nenhuma imagem encontrada para este tipo.',
      'ishare2.list.headers': 'ID,Nome,Tamanho,',
      'ishare2.list.count': '{count} item|{count} itens',
      'ishare2.install.missingIds': 'Não foi possível identificar o tipo ou ID da imagem.',
      'ishare2.installButton': 'Instalar'
    },
    en: {
      'ui.projectTitle': 'NetConfig Lab Image Manager',
      'ui.language.label': 'Language',
      'ui.language.auto': 'Automatic',
      'ui.language.pt': 'Portuguese',
      'ui.language.en': 'English',
      'ui.language.es': 'Spanish',
      'ui.tabs.images': 'Images',
      'ui.tabs.templates': 'Templates',
      'ui.tabs.icons': 'Icons',
      'ui.tabs.ishare2': 'iShare2',
      'ui.eveIpLabel': 'EVE-NG/PNETLab IP',
      'ui.eveIpPlaceholder': 'e.g., 10.0.0.10',
      'ui.eveUserLabel': 'SSH User',
      'ui.eveUserPlaceholder': 'e.g., root',
      'ui.evePassLabel': 'SSH Password',
      'ui.evePassPlaceholder': 'Password for the user in EVE',
      'ui.loadDataTitle': 'Load EVE / PNETLab data',
      'ui.loadDataHint': 'Provide IP, user and password, then click to load existing images, icons and templates.',
      'ui.loadDataBtn': 'Load data',
      'ui.loadDataBtnLoading': 'Loading...',
      'ui.images.typeLabel': 'Image type (destination)',
      'ui.images.typeHint': 'This only fills the base directory automatically. You can still edit it below.',
      'ui.images.baseDirLabel': 'Base directory in EVE',
      'ui.images.baseDirHint': 'QEMU: <code>/opt/unetlab/addons/qemu</code> · IOL: <code>/opt/unetlab/addons/iol/bin</code> · Dynamips: <code>/opt/unetlab/addons/dynamips</code>.',
      'ui.images.templateLabel': 'Template name (directory)',
      'ui.images.templatePlaceholder': 'e.g., mikrotik-6.38.4',
      'ui.images.filesLabel': 'Images (you can select multiple)',
      'ui.images.filesHint': 'Use names such as <code>hda.qcow2</code>, <code>hdb.qcow2</code>, <code>virtioa.qcow2</code>, etc.',
      'ui.images.progressShort': 'Uploading...',
      'ui.images.footerInfo': 'Select the files and click send to publish them to your EVE-NG.',
      'ui.images.checkBtn': 'Check existing images',
      'ui.images.uploadBtn': 'Upload images',
      'ui.images.fixBtn': 'Fix permissions',
      'ui.templates.existingLabel': 'Existing templates in EVE',
      'ui.templates.searchPlaceholder': 'Filter by name (e.g., huawei, juniper, mikrotik...)',
      'ui.templates.listBtn': 'List templates',
      'ui.templates.listHint': 'Click a template from the list to load its content in the editor below.',
      'ui.templates.fileLabel': 'Template filename',
      'ui.templates.filePlaceholder': 'e.g., huaweine40.yml',
      'ui.templates.fileHint': 'If no extension is provided, <code>.yml</code> will be used automatically.',
      'ui.templates.contentLabel': 'YAML template content',
      'ui.templates.contentPlaceholder': '# Paste or edit the YAML content here...',
      'ui.templates.contentHint': 'The file will be uploaded to <code>/opt/unetlab/html/templates/amd</code> and <code>/opt/unetlab/html/templates/intel</code>.',
      'ui.templates.loadBtn': 'Load template from EVE',
      'ui.templates.saveBtn': 'Save template to EVE',
      'ui.icons.existingLabel': 'Existing icons in EVE',
      'ui.icons.listBtn': 'List icons',
      'ui.icons.hint': 'List of icon files available in EVE-NG (e.g., <code>/opt/unetlab/html/images/icons</code>).',
      'ui.icons.uploadLabel': 'Upload new icon (PNG)',
      'ui.icons.uploadHint': 'The file will be sent to the EVE-NG icons directory. Prefer PNG with proper dimensions (e.g., 64x64).',
      'ui.icons.uploadBtn': 'Upload icon',
      'ui.ishare2.searchLabel': 'iShare2 search (search all)',
      'ui.ishare2.searchBtn': 'Search iShare2',
      'ui.ishare2.searchHint': 'This search uses <code>ishare2 search all</code> to list images available on iShare2 mirrors.',
      'ui.ishare2.resultLabel': 'Result',
      'ui.ishare2.filterPlaceholder': 'Filter by image names (e.g., mikrotik, juniper...)',
      'ui.ishare2.progressLabel': 'Installing...',
      'msg.parseError': 'Failed to parse server response.',
      'msg.networkError': 'Failed to communicate with the server.',
      'upload.progress': 'Uploading files... {percent}% ({loaded} MB of {total} MB)',
      'upload.progress.indeterminate': 'Uploading files...',
      'upload.processing': 'Processing on the server...',
      'upload.success': 'Upload completed successfully.',
      'upload.error': 'Error while processing upload.',
      'labels.context': 'Context:',
      'load.missingCreds': 'Fill in EVE/PNETLab IP, user and password before loading data.',
      'load.success': 'Data loaded: images, icons and templates refreshed.',
      'load.partial': 'Some sections did not load ({success}/{total}). Check the messages and try again.',
      'load.failed': 'Failed to load data. Please try again.',
      'platform.label': 'Detected: {name}',
      'platform.eve': 'EVE-NG',
      'platform.pnetlab': 'PNETLab',
      'platform.unknown': 'Not identified',
      'labels.target': 'Target:',
      'labels.step': 'Step:',
      'images.missingCreds': 'Fill in EVE IP, user and password to list the images.',
      'images.parseError': 'Failed to parse server response.',
      'images.emptyResponse': 'Empty API response.',
      'images.requestFail': 'Failed to list images.',
      'images.success': 'Images listed successfully.',
      'images.title': 'Existing images on EVE-NG',
      'images.updated': 'Updated just now',
      'images.templateCount': '{count} template|{count} templates',
      'images.none': 'No template found.',
      'images.vendorCount': '{count} version|{count} versions',
      'templates.missingCreds': 'Fill in IP, user and password to list templates.',
      'templates.parseError': 'Failed to parse response from templates API.',
      'templates.emptyResponse': 'Empty response from templates API.',
      'templates.requestFail': 'Failed to list templates.',
      'templates.successList': 'Templates listed successfully.',
      'templates.none': 'No templates found.',
      'templates.missingName': 'Provide the template filename (e.g., huaweine40.yml).',
      'templates.loadFail': 'Failed to fetch template.',
      'templates.loadSuccess': 'Template loaded.',
      'templates.saveMissingCreds': 'Fill in IP, user and password to save the template.',
      'templates.saveMissingName': 'Provide the template filename.',
      'templates.saveMissingContent': 'Fill in the YAML content before saving.',
      'templates.saveFail': 'Failed to upload template.',
      'templates.saveSuccess': 'Template uploaded successfully.',
      'icons.missingCreds': 'Fill in IP, user and password to list icons.',
      'icons.parseError': 'Failed to parse response from icons API.',
      'icons.emptyResponse': 'Empty response from icons API.',
      'icons.requestFail': 'Failed to list icons.',
      'icons.successList': 'Icons listed successfully.',
      'icons.none': 'No icons found.',
      'icons.uploadMissingCreds': 'Fill in IP, user and password to upload the icon.',
      'icons.uploadSelectFile': 'Select a PNG file to upload.',
      'icons.uploadParseError': 'Failed to parse icon upload response.',
      'icons.uploadSuccess': 'Icon uploaded successfully.',
      'icons.uploadFail': 'Failed to upload icon.',
      'fix.missingCreds': 'Fill in IP, user and password to run fix permissions.',
      'fix.parseError': 'Failed to parse fix permissions response.',
      'fix.success': 'Fix permissions executed successfully.',
      'fix.fail': 'Failed to run fix permissions.',
      'fix.notFound': 'Fix permissions endpoint not found (make sure /api/fixpermissions is exposed).',
      'ishare2.install.start': 'Starting installation on EVE...',
      'ishare2.install.notFound': 'iShare2 installation job was not found.',
      'ishare2.install.pull': 'Downloading image via iShare2... {progress}%',
      'ishare2.install.copy': 'Sending image to EVE... {progress}%',
      'ishare2.install.fix': 'Applying fixpermissions on EVE... {progress}%',
      'ishare2.install.generic': 'Installing on EVE... {progress}%',
      'ishare2.install.success': 'Image installed successfully via iShare2.',
      'ishare2.install.fail': 'Failed to install image via iShare2.',
      'ishare2.install.confirm': 'Do you want to start installing the image {namePart}({type} #{id})?',
      'ishare2.install.missingCreds': 'Fill in EVE-NG IP, user and password before installing an image via iShare2.',
      'ishare2.install.timeout': 'The server took too long to respond to the installation request (error 504 - Gateway Timeout). Installing large images can take several minutes. Check the EVE/iShare2 logs to confirm the state of the installation and try again if needed.',
      'ishare2.install.noServer': 'Could not reach the server when running install on iShare2. Check your connection or whether the service is running.',
      'ishare2.install.parseError': 'Failed to parse the iShare2 install response (HTTP {status}). The server response is not in the expected format.',
      'ishare2.install.empty': 'Empty response from iShare2 install API.',
      'ishare2.install.failStart': 'Failed to start installation via iShare2.',
      'ishare2.install.started': 'Installation started via iShare2. Follow the progress below.',
      'ishare2.install.commFail': 'Failed to communicate with the server while running install on iShare2.',
      'ishare2.search.timeout': 'The server took too long to respond to the iShare2 query (error 504 - Gateway Timeout). Try again shortly or check the backend logs.',
      'ishare2.search.noServer': 'Could not reach the server when querying iShare2. Check your connection or whether the service is running.',
      'ishare2.search.parseError': 'Failed to parse iShare2 API response (HTTP {status}). The server response is not in the expected format.',
      'ishare2.search.empty': 'Empty response from the iShare2 API.',
      'ishare2.search.fail': 'Failed to run ishare2 search all.',
      'ishare2.search.success': 'iShare2 search completed successfully.',
      'ishare2.search.noOutput': 'No output returned by ishare2.',
      'ishare2.list.none': 'No images found for this type.',
      'ishare2.list.headers': 'ID,Name,Size,',
      'ishare2.list.count': '{count} item|{count} items',
      'ishare2.install.missingIds': 'Could not identify the image type or ID.',
      'ishare2.installButton': 'Install'
    },
    es: {
      'ui.projectTitle': 'NetConfig Lab Image Manager',
      'ui.language.label': 'Idioma',
      'ui.language.auto': 'Automático',
      'ui.language.pt': 'Portugués',
      'ui.language.en': 'Inglés',
      'ui.language.es': 'Español',
      'ui.tabs.images': 'Imágenes',
      'ui.tabs.templates': 'Plantillas',
      'ui.tabs.icons': 'Íconos',
      'ui.tabs.ishare2': 'iShare2',
      'ui.eveIpLabel': 'IP del EVE-NG/PNETLab',
      'ui.eveIpPlaceholder': 'Ej: 10.0.0.10',
      'ui.eveUserLabel': 'Usuario SSH',
      'ui.eveUserPlaceholder': 'Ej: root',
      'ui.evePassLabel': 'Contraseña SSH',
      'ui.evePassPlaceholder': 'Contraseña del usuario en el EVE',
      'ui.loadDataTitle': 'Cargar datos de EVE / PNETLab',
      'ui.loadDataHint': 'Ingrese IP, usuario y contraseña y haga clic para cargar imágenes, íconos y plantillas existentes.',
      'ui.loadDataBtn': 'Cargar datos',
      'ui.loadDataBtnLoading': 'Cargando...',
      'ui.images.typeLabel': 'Tipo de imagen (destino)',
      'ui.images.typeHint': 'Solo completa automáticamente el directorio base. Aún puedes editarlo abajo.',
      'ui.images.baseDirLabel': 'Directorio base en el EVE',
      'ui.images.baseDirHint': 'QEMU: <code>/opt/unetlab/addons/qemu</code> · IOL: <code>/opt/unetlab/addons/iol/bin</code> · Dynamips: <code>/opt/unetlab/addons/dynamips</code>.',
      'ui.images.templateLabel': 'Nombre del template (directorio)',
      'ui.images.templatePlaceholder': 'Ej: mikrotik-6.38.4',
      'ui.images.filesLabel': 'Imágenes (puedes seleccionar varias)',
      'ui.images.filesHint': 'Usa nombres como <code>hda.qcow2</code>, <code>hdb.qcow2</code>, <code>virtioa.qcow2</code>, etc.',
      'ui.images.progressShort': 'Enviando...',
      'ui.images.footerInfo': 'Selecciona los archivos y haz clic en enviar para publicarlos en tu EVE-NG.',
      'ui.images.checkBtn': 'Verificar imágenes existentes',
      'ui.images.uploadBtn': 'Enviar imágenes',
      'ui.images.fixBtn': 'Fix permissions',
      'ui.templates.existingLabel': 'Plantillas existentes en el EVE',
      'ui.templates.searchPlaceholder': 'Filtrar por nombre (ej: huawei, juniper, mikrotik...)',
      'ui.templates.listBtn': 'Listar plantillas',
      'ui.templates.listHint': 'Haz clic en una plantilla de la lista para cargar el contenido en el editor abajo.',
      'ui.templates.fileLabel': 'Nombre del archivo de plantilla',
      'ui.templates.filePlaceholder': 'Ej: huaweine40.yml',
      'ui.templates.fileHint': 'Si no informas la extensión, se usará <code>.yml</code> automáticamente.',
      'ui.templates.contentLabel': 'Contenido YAML de la plantilla',
      'ui.templates.contentPlaceholder': '# Pega o edita aquí el contenido YAML de la plantilla...',
      'ui.templates.contentHint': 'El archivo se enviará a <code>/opt/unetlab/html/templates/amd</code> y <code>/opt/unetlab/html/templates/intel</code>.',
      'ui.templates.loadBtn': 'Cargar plantilla desde el EVE',
      'ui.templates.saveBtn': 'Guardar plantilla en el EVE',
      'ui.icons.existingLabel': 'Íconos existentes en el EVE',
      'ui.icons.listBtn': 'Listar íconos',
      'ui.icons.hint': 'Lista de archivos de íconos disponibles en EVE-NG (ej: <code>/opt/unetlab/html/images/icons</code>).',
      'ui.icons.uploadLabel': 'Enviar nuevo ícono (PNG)',
      'ui.icons.uploadHint': 'El archivo se enviará al directorio de íconos del EVE-NG. Se recomienda PNG con dimensiones adecuadas (ej: 64x64).',
      'ui.icons.uploadBtn': 'Enviar ícono',
      'ui.ishare2.searchLabel': 'Búsqueda en iShare2 (search all)',
      'ui.ishare2.searchBtn': 'Buscar en iShare2',
      'ui.ishare2.searchHint': 'Esta búsqueda usa el comando <code>ishare2 search all</code> para listar imágenes disponibles en los mirrors de iShare2.',
      'ui.ishare2.resultLabel': 'Resultado',
      'ui.ishare2.filterPlaceholder': 'Filtrar por nombres de imagen (ej: mikrotik, juniper...)',
      'ui.ishare2.progressLabel': 'Instalando...',
      'msg.parseError': 'Error al interpretar la respuesta del servidor.',
      'msg.networkError': 'Fallo de comunicación con el servidor.',
      'upload.progress': 'Enviando archivos... {percent}% ({loaded} MB de {total} MB)',
      'upload.progress.indeterminate': 'Enviando archivos...',
      'upload.processing': 'Procesando en el servidor...',
      'upload.success': 'Carga finalizada con éxito.',
      'upload.error': 'Error al procesar la carga.',
      'labels.context': 'Contexto:',
      'load.missingCreds': 'Complete IP, usuario y contraseña de EVE/PNETLab antes de cargar los datos.',
      'load.success': 'Datos cargados: imágenes, íconos y plantillas actualizados.',
      'load.partial': 'Algunas secciones no se cargaron ({success}/{total}). Revisa los mensajes e inténtalo nuevamente.',
      'load.failed': 'No se pudieron cargar los datos. Inténtalo nuevamente.',
      'platform.label': 'Detectado: {name}',
      'platform.eve': 'EVE-NG',
      'platform.pnetlab': 'PNETLab',
      'platform.unknown': 'No identificado',
      'labels.target': 'Destino:',
      'labels.step': 'Etapa:',
      'images.missingCreds': 'Completa IP del EVE, usuario y contraseña para listar las imágenes.',
      'images.parseError': 'Error al interpretar la respuesta del servidor.',
      'images.emptyResponse': 'Respuesta vacía de la API.',
      'images.requestFail': 'No se pudieron listar las imágenes.',
      'images.success': 'Imágenes listadas con éxito.',
      'images.title': 'Imágenes existentes en el EVE-NG',
      'images.updated': 'Actualizado ahora',
      'images.templateCount': '{count} plantilla|{count} plantillas',
      'images.none': 'Ninguna plantilla encontrada.',
      'images.vendorCount': '{count} versión|{count} versiones',
      'templates.missingCreds': 'Completa IP, usuario y contraseña para listar plantillas.',
      'templates.parseError': 'Error al interpretar la respuesta de la API de plantillas.',
      'templates.emptyResponse': 'Respuesta vacía de la API de plantillas.',
      'templates.requestFail': 'No se pudieron listar las plantillas.',
      'templates.successList': 'Plantillas listadas con éxito.',
      'templates.none': 'Ninguna plantilla encontrada.',
      'templates.missingName': 'Indica el nombre del archivo de plantilla (ej: huaweine40.yml).',
      'templates.loadFail': 'No se pudo buscar la plantilla.',
      'templates.loadSuccess': 'Plantilla cargada.',
      'templates.saveMissingCreds': 'Completa IP, usuario y contraseña para guardar la plantilla.',
      'templates.saveMissingName': 'Indica el nombre del archivo de plantilla.',
      'templates.saveMissingContent': 'Completa el contenido YAML antes de guardar.',
      'templates.saveFail': 'No se pudo enviar la plantilla.',
      'templates.saveSuccess': 'Plantilla enviada con éxito.',
      'icons.missingCreds': 'Completa IP, usuario y contraseña para listar íconos.',
      'icons.parseError': 'Error al interpretar la respuesta de la API de íconos.',
      'icons.emptyResponse': 'Respuesta vacía de la API de íconos.',
      'icons.requestFail': 'No se pudieron listar los íconos.',
      'icons.successList': 'Íconos listados con éxito.',
      'icons.none': 'Ningún ícono encontrado.',
      'icons.uploadMissingCreds': 'Completa IP, usuario y contraseña para enviar el ícono.',
      'icons.uploadSelectFile': 'Selecciona un archivo PNG para enviar.',
      'icons.uploadParseError': 'Error al interpretar la respuesta de carga de ícono.',
      'icons.uploadSuccess': 'Ícono enviado con éxito.',
      'icons.uploadFail': 'No se pudo enviar el ícono.',
      'fix.missingCreds': 'Completa IP, usuario y contraseña para ejecutar el fix permissions.',
      'fix.parseError': 'Error al interpretar la respuesta del fix permissions.',
      'fix.success': 'Fix permissions ejecutado con éxito.',
      'fix.fail': 'No se pudo ejecutar fix permissions.',
      'fix.notFound': 'Endpoint de fix permissions no encontrado (verifica si /api/fixpermissions está expuesto).',
      'ishare2.install.start': 'Iniciando instalación en el EVE...',
      'ishare2.install.notFound': 'No se encontró el job de instalación del iShare2.',
      'ishare2.install.pull': 'Descargando imagen vía iShare2... {progress}%',
      'ishare2.install.copy': 'Enviando imagen al EVE... {progress}%',
      'ishare2.install.fix': 'Aplicando fixpermissions en el EVE... {progress}%',
      'ishare2.install.generic': 'Instalando en el EVE... {progress}%',
      'ishare2.install.success': 'Imagen instalada con éxito vía iShare2.',
      'ishare2.install.fail': 'Fallo al instalar la imagen vía iShare2.',
      'ishare2.install.confirm': '¿Deseas iniciar la instalación de la imagen {namePart}({type} #{id})?',
      'ishare2.install.missingCreds': 'Completa IP, usuario y contraseña del EVE-NG antes de instalar una imagen por iShare2.',
      'ishare2.install.timeout': 'El servidor tardó demasiado en responder a la solicitud de instalación (error 504 - Gateway Timeout). La instalación de imágenes grandes puede tardar varios minutos. Verifica los logs de EVE/iShare2 para confirmar el estado de la instalación y vuelve a intentarlo si es necesario.',
      'ishare2.install.noServer': 'No se pudo contactar al servidor al ejecutar install en iShare2. Verifica tu conexión o si el servicio está en ejecución.',
      'ishare2.install.parseError': 'Error al interpretar la respuesta del install del iShare2 (HTTP {status}). La respuesta del servidor no está en el formato esperado.',
      'ishare2.install.empty': 'Respuesta vacía de la API de install del iShare2.',
      'ishare2.install.failStart': 'No se pudo iniciar la instalación vía iShare2.',
      'ishare2.install.started': 'Instalación iniciada vía iShare2. Sigue el progreso abajo.',
      'ishare2.install.commFail': 'Fallo de comunicación con el servidor al ejecutar install en iShare2.',
      'ishare2.search.timeout': 'El servidor tardó demasiado en responder a la consulta del iShare2 (error 504 - Gateway Timeout). Intenta nuevamente en unos instantes o revisa los logs del backend.',
      'ishare2.search.noServer': 'No se pudo contactar al servidor al consultar el iShare2. Verifica tu conexión o si el servicio está en ejecución.',
      'ishare2.search.parseError': 'Error al interpretar la respuesta de la API del iShare2 (HTTP {status}). La respuesta del servidor no está en el formato esperado.',
      'ishare2.search.empty': 'Respuesta vacía de la API del iShare2.',
      'ishare2.search.fail': 'No se pudo ejecutar ishare2 search all.',
      'ishare2.search.success': 'Búsqueda en iShare2 finalizada con éxito.',
      'ishare2.search.noOutput': 'Ninguna salida retornada por ishare2.',
      'ishare2.list.none': 'Ninguna imagen encontrada para este tipo.',
      'ishare2.list.headers': 'ID,Nombre,Tamaño,',
      'ishare2.list.count': '{count} ítem|{count} ítems',
      'ishare2.install.missingIds': 'No fue posible identificar el tipo o ID de la imagen.',
      'ishare2.installButton': 'Instalar'
    }
  };

  function normalize(lang) {
    if (!lang) return 'en';
    const lower = lang.toLowerCase();
    if (lower === 'auto') return 'auto';
    if (lower.startsWith('pt')) return 'pt';
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('en')) return 'en';
    return 'en';
  }

  function detectBrowserLanguage() {
    const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean);
    for (let i = 0; i < candidates.length; i++) {
      const normalized = normalize(candidates[i]);
      if (normalized === 'pt' || normalized === 'es' || normalized === 'en') {
        return normalized;
      }
    }
    return 'en';
  }

  function selectTemplate(template, vars) {
    if (typeof template !== 'string') return '';
    if (!vars || typeof vars.count === 'undefined') {
      return template;
    }
    const parts = template.split('|');
    if (parts.length === 2) {
      return vars.count === 1 ? parts[0] : parts[1];
    }
    return template;
  }

  function renderTemplate(template, vars) {
    const rendered = template.replace(/\{(\w+)\}/g, function (_, key) {
      if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
        return String(vars[key]);
      }
      return '{' + key + '}';
    });
    return rendered;
  }

  let preferredLang = normalize(localStorage.getItem(STORAGE_KEY) || 'auto');
  let resolvedLang = preferredLang === 'auto' ? detectBrowserLanguage() : preferredLang;

  function translate(key, vars) {
    const langDict = translations[resolvedLang] || translations.en;
    const fallbackDict = translations.en;
    let template = langDict[key] || fallbackDict[key] || translations.pt[key] || key;
    if (typeof template !== 'string') {
      return key;
    }
    template = selectTemplate(template, vars);
    return vars ? renderTemplate(template, vars) : template;
  }

  function getResolvedLanguage() {
    return resolvedLang;
  }

  function setLanguage(lang) {
    preferredLang = normalize(lang);
    localStorage.setItem(STORAGE_KEY, preferredLang);
    resolvedLang = preferredLang === 'auto' ? detectBrowserLanguage() : preferredLang;
    applyTranslations();
    window.dispatchEvent(new CustomEvent('netconfig:language-changed', {
      detail: { lang: resolvedLang, preferred: preferredLang }
    }));
  }

  function applyTranslations() {
    document.documentElement.setAttribute('lang', resolvedLang);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = translate(key);
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      el.innerHTML = translate(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.setAttribute('placeholder', translate(key));
    });

    document.querySelectorAll('[data-i18n-value]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-value');
      if (!key) return;
      el.setAttribute('value', translate(key));
    });

    const select = document.getElementById('languageSelect');
    if (select) {
      select.value = preferredLang;
    }
  }

  function initLanguageSelector() {
    const select = document.getElementById('languageSelect');
    if (!select) return;
    select.addEventListener('change', function () {
      setLanguage(select.value || 'auto');
    });
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.t = translate;
  window.NetConfigApp.getLanguage = getResolvedLanguage;
  window.NetConfigApp.setLanguage = setLanguage;
  window.NetConfigApp.applyTranslations = applyTranslations;

  document.addEventListener('DOMContentLoaded', function () {
    applyTranslations();
    initLanguageSelector();
  });
})();

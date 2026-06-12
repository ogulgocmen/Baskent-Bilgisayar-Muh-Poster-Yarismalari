// --- YARIŞMA OLUŞTURMA VE LİSTELEME ---

async function createElection() {
    const electionName = document.getElementById("electionName").value.trim();

    if (!electionName) {
        alert("Lütfen yarışma adı giriniz.");
        return;
    }

    const { data, error } = await supabaseClient
        .from("elections")
        .insert([{ name: electionName, status: "PREPARING" }])
        .select();

    if (error) {
        console.error("Hata Durumu:", error);
        document.getElementById("electionMessage").innerText = "Hata: " + error.message;
        return;
    }

    document.getElementById("electionMessage").innerText = "Yarışma başarıyla oluşturuldu.";
    document.getElementById("electionName").value = "";
    
    await loadElections(); // Listeyi güncelle
}

const btnCreate = document.getElementById("btnCreateElection");
if (btnCreate) btnCreate.addEventListener("click", createElection);


async function loadElections() {
    // Yarışmaları çekerken en son oluşturulan en üstte görünsün diye 'id'ye göre tersten (descending) sıralıyoruz
    const { data, error } = await supabaseClient
        .from("elections")
        .select("*")
        .order("id", { ascending: false });

    const select = document.getElementById("electionSelect");
    const visualList = document.getElementById("electionsVisualList"); // Yeni eklediğimiz liste elementi

    if (error) {
        console.error("Yarışmalar yüklenirken hata:", error);
        if (visualList) visualList.innerHTML = `<li style="color:red;">Yarışmalar yüklenirken hata oluştu!</li>`;
        return;
    }

    // 1. AŞAMA: Aşağıdaki Seçim Kutusunu (Dropdown) Doldurma
    if (select) {
        select.innerHTML = '<option value="">Yarışma Seçiniz</option>';
        // Seçim kutusunda düzgün bir sıra için veriyi (kopyasını) id'ye göre düz sıralayabiliriz
        const sortedForSelect = [...data].sort((a, b) => a.id - b.id);
        sortedForSelect.forEach(election => {
            const option = document.createElement("option");
            option.value = election.id;
            option.textContent = `${election.name} (${election.id})`;
            select.appendChild(option);
        });
    }

    // 2. AŞAMA: Yeni Eklenen Üst Paneldeki Görsel Listeyi Doldurma
    if (visualList) {
        if (data.length === 0) {
            visualList.innerHTML = `<li style="color: #718096;">Henüz sisteme kayıtlı bir yarışma bulunmuyor.</li>`;
            return;
        }

        visualList.innerHTML = ""; // Yükleniyor yazısını temizle

        data.forEach(election => {
            const li = document.createElement("li");
            li.style.marginBottom = "8px";
            
            // Veritabanındaki İngilizce durumları Türkçe karşılıklarına çeviriyoruz
            let statusBadge = "";
            if (election.status === "PREPARING") {
                statusBadge = `<span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; font-size: 11px; border-radius: 4px; font-weight: bold;">Hazırlanıyor</span>`;
            } else if (election.status === "ACTIVE") {
                statusBadge = `<span style="background: #c6f6d5; color: #22543d; padding: 2px 6px; font-size: 11px; border-radius: 4px; font-weight: bold;">Aktif (Oylama Açık)</span>`;
            } else if (election.status === "COMPLETED") {
                statusBadge = `<span style="background: #fed7d7; color: #742a2a; padding: 2px 6px; font-size: 11px; border-radius: 4px; font-weight: bold;">Tamamlandı (Kapalı)</span>`;
            }

            li.innerHTML = `
                <strong style="color: #2d3748;">${election.name}</strong> 
                <span style="color: #718096; font-size: 13px;">(ID: ${election.id})</span> 
                — ${statusBadge}
            `;
            visualList.appendChild(li);
        });
    }
}

loadElections();

// --- CSV İŞLEMLERİ ---

const importButton = document.getElementById("btnImportCsv");
if (importButton) {
    importButton.addEventListener("click", importCsv);
}

async function importCsv() {
    const electionId = document.getElementById("electionSelect").value;
    const file = document.getElementById("csvFile").files[0];

    if (!electionId) {
        alert("Lütfen bir yarışma seçiniz.");
        return;
    }

    if (!file) {
        alert("Lütfen bir CSV dosyası seçiniz.");
        return;
    }

    document.getElementById("csvMessage").innerText = "CSV işleniyor, lütfen bekleyin...";

    Papa.parse(file, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        encoding: "windows-1254",
        complete: async function(results) {
            await processCsv(electionId, results.data);
        }
    });
}

async function processCsv(electionId, rows) {
    const groupedProjects = {};
    let currentProjectName = null;
    let isCurrentProjectActive = false;

    // Satırları tek tek dönerek CSV'deki boşluk mantığına göre projeleri ve takım üyelerini grupla
    rows.forEach(row => {
        const projeAdi = row.PROJE_ADI ? row.PROJE_ADI.trim() : "";
        
        // Eğer PROJE_ADI doluysa, bu yeni bir projenin başlangıcıdır
        if (projeAdi !== "") {
            const katilim = row.KATILIM ? row.KATILIM.trim().toUpperCase() : "";
            
            if (katilim === "E") {
                isCurrentProjectActive = true; // Proje kabul edilmiş, üyeleri toplamaya başla
                currentProjectName = projeAdi;
                
                if (!groupedProjects[currentProjectName]) {
                    groupedProjects[currentProjectName] = {
                        advisor: row.DANISMAN ? row.DANISMAN.trim() : null,
                        members: []
                    };
                }
            } else {
                // KATILIM "E" değilse (örn: "H" ise), bu projeyi ve altındaki üyeleri atla
                isCurrentProjectActive = false;
                currentProjectName = null;
            }
        }

        // Eğer onaylı bir projenin içindeysek (veya takım arkadaşlarının alt satırlarındaysak), üyeyi ekle
        if (isCurrentProjectActive && currentProjectName) {
            let firstName = "";
            let lastName = "";
            const fullName = row.AD_SOYAD ? row.AD_SOYAD.trim() : "";
            
            // İsim Soyisim Ayırma Mantığı
            if (fullName) {
                const nameParts = fullName.split(' ');
                if (nameParts.length > 1) {
                    lastName = nameParts.pop();
                    firstName = nameParts.join(' ');
                } else {
                    firstName = fullName;
                }
            }

            // Gruptaki öğrenciyi listeye ekle
            groupedProjects[currentProjectName].members.push({
                student_no: row.OGRENCI_NO ? row.OGRENCI_NO.toString().trim() : null,
                first_name: firstName,
                last_name: lastName,
                email: row.EMAIL ? row.EMAIL.trim() : null,
                phone: row.TELEFON ? row.TELEFON.trim() : null
            });
        }
    });

    // Projeleri alfabetik sırala (böylece Poster Numaraları düzenli artar)
    const projectNames = Object.keys(groupedProjects).sort((a,b) => a.localeCompare(b, "tr"));
    let posterNo = 1;
    let hasError = false;

    for (const projectName of projectNames) {
        const project = groupedProjects[projectName];

        // 1. Önce Projeyi Veritabanına Ekle
        const { data: insertedProject, error: projectError } = await supabaseClient
            .from("projects")
            .insert([{
                election_id: parseInt(electionId),
                project_no: posterNo,
                project_name: projectName,
                advisor: project.advisor
            }])
            .select()
            .single();

        if (projectError) {
            console.error(`Proje eklenirken hata oluştu (${projectName}):`, projectError);
            hasError = true;
            continue; // Hata varsa üyeleri ekleme, sıradaki projeye geç
        }

        // 2. Proje eklendiyse, dönen "id" ile üyeleri projeye bağla
        const members = project.members.map(member => ({
            project_id: insertedProject.id,
            student_no: member.student_no,
            first_name: member.first_name,
            last_name: member.last_name,
            email: member.email,
            phone: member.phone
        }));

        if (members.length > 0) {
            // Takım üyelerini veritabanına ekle
            const { error: membersError } = await supabaseClient
                .from("project_members")
                .insert(members);
            
            if (membersError) {
                console.error(`Üyeler eklenirken hata oluştu (${projectName}):`, membersError);
                hasError = true;
            }
        }

        posterNo++;
    }

  
    // --- YENİ EKLENEN İSTATİSTİK VE MESAJ EKRANI ---
    
    // Toplam projeyi (grubu) ve toplam öğrenciyi hesapla
    const totalProjects = projectNames.length;
    let totalStudents = 0;
    for (const pName of projectNames) {
        totalStudents += groupedProjects[pName].members.length;
    }

    const messageDiv = document.getElementById("csvMessage");

    if (hasError) {
        messageDiv.style.color = "red";
        messageDiv.innerHTML = `
            <strong>⚠️ Dikkat:</strong> CSV işlendi ancak bazı kayıtlarda hata oluştu.<br>
            Tarayıcı konsolunu (F12) kontrol edin.
        `;
    } else {
        messageDiv.style.color = "green";
        messageDiv.innerHTML = `
            <strong>✅ Başarılı!</strong> CSV başarıyla içe aktarıldı.<br><br>
            📊 <strong>Oluşturulan Proje (Grup) Sayısı:</strong> ${totalProjects}<br>
            👥 <strong>Sisteme Kaydedilen Toplam Öğrenci:</strong> ${totalStudents}
        `;
    }
} 

// --- ADMIN KOD ÜRETME VE YÖNETİM FONKSİYONLARI ---

function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Karışabilecek O, 0, 1, I harfleri çıkarıldı
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const btnGenerate = document.getElementById("btnGenerateCodes");
if (btnGenerate) {
    btnGenerate.addEventListener("click", async () => {
        const electionId = document.getElementById("electionSelect").value;
        const amount = parseInt(document.getElementById("codeAmount").value);
        
        if (!electionId) return alert("Önce listeden bir yarışma seçin.");
        if (!amount || amount < 1 || amount > 1000) return alert("Geçerli bir sayı girin (1-1000).");

        document.getElementById("codeMessage").innerText = "Kodlar üretiliyor, lütfen bekleyin...";
        
        const codesToInsert = [];
        for(let i = 0; i < amount; i++) {
            codesToInsert.push({
                election_id: electionId,
                code: generateRandomCode(),
                used: false
            });
        }

        const { error } = await supabaseClient.from("voting_codes").insert(codesToInsert);
        
        if (error) {
            document.getElementById("codeMessage").innerText = "Hata oluştu: " + error.message;
        } else {
            document.getElementById("codeMessage").innerText = `${amount} adet kod başarıyla üretildi.`;
            loadElectionStats(); // İstatistikleri güncelle
        }
    });
}

// Oylama Durumlarını Değiştirme
async function updateElectionStatus(newStatus) {
    const electionId = document.getElementById("electionSelect").value;
    if (!electionId) return alert("Önce listeden bir yarışma seçin.");

    const confirmMsg = newStatus === 'ACTIVE' 
        ? "Oylamayı başlatmak istediğinize emin misiniz?" 
        : "Oylamayı BİTİRMEK istediğinize emin misiniz? Bu işlem geri alınamaz ve oylama tamamen kapanır.";

    if (!confirm(confirmMsg)) return;

    const { error } = await supabaseClient
        .from("elections")
        .update({ status: newStatus })
        .eq("id", electionId);

    if (error) alert("Hata: " + error.message);
    else alert("Durum güncellendi!");
    
    // Select kutusunda değişiklik olduğunda da tetiklenmesi için:
    document.getElementById("electionSelect").dispatchEvent(new Event('change'));
}

const btnStart = document.getElementById("btnStartElection");
const btnEnd = document.getElementById("btnEndElection");

if (btnStart) btnStart.addEventListener("click", () => updateElectionStatus('ACTIVE'));
if (btnEnd) btnEnd.addEventListener("click", () => updateElectionStatus('COMPLETED'));

// Seçilen yarışmaya göre istatistikleri yükle
const selectElectionEl = document.getElementById("electionSelect");
if (selectElectionEl) {
    selectElectionEl.addEventListener("change", loadElectionStats);
}

async function loadElectionStats() {
    const electionId = document.getElementById("electionSelect").value;
    if (!electionId) return;

    // Yarışma Durumunu Çek
    const { data: elData } = await supabaseClient.from("elections").select("status").eq("id", electionId).single();
    if(elData) {
        document.getElementById("electionStatusBadge").innerText = elData.status === "PREPARING" ? "Hazırlanıyor" : elData.status === "ACTIVE" ? "Aktif (Oylama Açık)" : "Tamamlandı (Oylama Kapalı)";
    }

    // Kod İstatistiklerini Çek
    const { data: codes, error } = await supabaseClient.from("voting_codes").select("used").eq("election_id", electionId);
    
    if (codes) {
        const total = codes.length;
        const used = codes.filter(c => c.used).length;
        
        document.getElementById("totalCodes").innerText = total;
        document.getElementById("usedCodes").innerText = used;
        document.getElementById("unusedCodes").innerText = total - used;
    }
}


// --- KODLARI LİSTELEME VE PDF/YAZDIRMA MOTORU ---

const btnShowCodes = document.getElementById("btnShowCodes");
if (btnShowCodes) {
    btnShowCodes.addEventListener("click", async () => {
        const electionId = document.getElementById("electionSelect").value;
        if (!electionId) return alert("Lütfen önce bir yarışma seçiniz.");

        const { data: codes, error } = await supabaseClient
            .from("voting_codes")
            .select("code, used")
            .eq("election_id", electionId)
            .order("id", { ascending: true });

        if (error) return alert("Kodlar getirilirken hata oluştu: " + error.message);
        if (codes.length === 0) return alert("Bu yarışmaya ait üretilmiş kod bulunamadı.");

        const container = document.getElementById("codesPreviewContainer");
        const textArea = document.getElementById("txtCodesArea");

        // Kodları alt alta satırlar halinde diz
        const formattedCodes = codes.map(c => `${c.code}\t(${c.used ? 'KULLANILDI' : 'KULLANILMADI'})`).join("\n");
        
        textArea.value = formattedCodes;
        container.style.display = "block"; 
    });
}

const btnPrintCodes = document.getElementById("btnPrintCodes");
if (btnPrintCodes) {
    btnPrintCodes.addEventListener("click", async () => {
        const electionId = document.getElementById("electionSelect").value;
        const selectBox = document.getElementById("electionSelect");
        const electionName = selectBox.options[selectBox.selectedIndex].text;

        if (!electionId) return alert("Lütfen önce bir yarışma seçiniz.");

        const { data: codes, error } = await supabaseClient
            .from("voting_codes")
            .select("code, used")
            .eq("election_id", electionId)
            .order("id", { ascending: true });

        if (error) return alert("Kodlar yüklenirken hata oluştu: " + error.message);
        if (codes.length === 0) return alert("Yazdırılacak kod bulunamadı.");

        const printWindow = window.open('', '_blank');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Oy Kodları - ${electionName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background-color: #fff; color: #000; }
                    .no-print-zone { margin-bottom: 20px; background: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; }
                    .btn-print { padding: 10px 25px; font-size: 16px; font-weight: bold; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
                    
                    /* Kesilebilir Kart Izgara Düzeni */
                    .grid-container { display: block; width: 100%; }
                    .code-card { 
                        display: inline-block; 
                        width: 23%; 
                        margin: 1%; 
                        border: 2px dashed #000; 
                        padding: 15px 10px; 
                        box-sizing: border-box; 
                        text-align: center; 
                        border-radius: 6px;
                        background: #fff;
                        page-break-inside: avoid;
                    }
                    .card-header { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 5px; }
                    .card-code { font-size: 18px; font-weight: bold; letter-spacing: 2px; font-family: monospace; margin: 8px 0; }
                    .card-footer { font-size: 9px; color: #777; border-top: 1px solid #eee; padding-top: 5px; margin-top: 5px; }
                    
                    @media print {
                        .no-print-zone { display: none !important; }
                        body { margin: 0; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print-zone">
                    <h2>🖨️ Kod Yazdırma ve PDF Paneli</h2>
                    <p>Aşağıdaki yeşil butona basarak hedefi <strong>"PDF Olarak Kaydet"</strong> seçebilir ve dosyayı bilgisayarınıza indirebilirsiniz.</p>
                    <button class="btn-print" onclick="window.print()">Yazdır / PDF Kaydet</button>
                </div>
                
                <h3 class="no-print-zone" style="text-align:center;">Yarışma: ${electionName}</h3>
                
                <div class="grid-container">
                    ${codes.map((c, index) => `
                        <div class="code-card" style="${c.used ? 'opacity: 0.4; background: #f0f0f0;' : ''}">
                            <div class="card-header">POSTER OYLAMA SİSTEMİ</div>
                            <div class="card-code">${c.code}</div>
                            <div class="card-footer">
                                Sıra: ${index + 1} | Durum: ${c.used ? 'KULLANILDI' : 'AKTİF'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
    });
}

// --- YARIŞMA VE BAĞLI VERİLERİ SİLME İŞLEMİ ---

const btnDelete = document.getElementById("btnDeleteElection");
if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
        const electionId = document.getElementById("electionSelect").value;
        const selectBox = document.getElementById("electionSelect");
        
        if (!electionId) {
            return alert("Lütfen silmek istediğiniz yarışmayı listeden seçin.");
        }

        const electionName = selectBox.options[selectBox.selectedIndex].text;

        // Güvenlik Duvarı: Kullanıcıdan yazılı onay al
        const warningMessage = `DİKKAT!\n\n"${electionName}" adlı yarışmayı siliyorsunuz.\nBu işlem o yarışmaya ait TÜM posterleri, öğrenci kayıtlarını, verilmiş oyları ve oy kodlarını kalıcı olarak silecektir!\n\nİşlemi onaylıyorsanız aşağıdaki kutuya büyük harflerle SİL yazın:`;
        
        const userInput = prompt(warningMessage);

        if (userInput !== "SİL") {
            alert("Silme işlemi iptal edildi. Verileriniz güvende.");
            return;
        }

        const btn = document.getElementById("btnDeleteElection");
        btn.innerText = "Siliniyor...";
        btn.disabled = true;

        const { error } = await supabaseClient
            .from("elections")
            .delete()
            .eq("id", electionId);

        if (error) {
            alert("Veritabanı hatası oluştu: " + error.message);
            btn.innerText = "🗑️ Seçili Yarışmayı Komple Sil";
            btn.disabled = false;
            return;
        }

        alert("Yarışma ve ona bağlı tüm veriler başarıyla silindi.");
        
        await loadElections(); 
        
        document.getElementById("electionStatusBadge").innerText = "-";
        document.getElementById("totalCodes").innerText = "0";
        document.getElementById("usedCodes").innerText = "0";
        document.getElementById("unusedCodes").innerText = "0";
        
        btn.innerText = "🗑️ Seçili Yarışmayı Komple Sil";
        btn.disabled = false;
    });
}

// --- CANLI İSTATİSTİK GÜNCELLEME (REALTIME) ---

supabaseClient
    .channel('realtime-codes-channel')
    .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'voting_codes' }, 
        (payload) => {
            const selectedElectionId = document.getElementById("electionSelect").value;
            
            if (selectedElectionId && payload.new.election_id == selectedElectionId) {
                loadElectionStats();
            }
        }
    )
    .subscribe();